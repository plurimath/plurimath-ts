#!/usr/bin/env ruby
# frozen_string_literal: true

# Ruby is the right fit here because this entry point exists to drive the
# repository's Ruby generators under the oracle's Bundler context. Re-wrapping
# them in Node would add a second runtime at the orchestration layer without
# removing any Ruby coupling.

require "fileutils"
require "json"
require "open3"
require "tmpdir"

module OracleGate
  class Error < StandardError; end
  class UsageError < Error; end

  REPO_ROOT = File.expand_path("..", __dir__)
  SUBMODULE_RELATIVE_PATH = "submodules/plurimath-testsuite"
  SUBMODULE_ROOT = File.join(REPO_ROOT, SUBMODULE_RELATIVE_PATH)
  ORACLE_ENV = "PLURIMATH_ORACLE"

  module_function

  def usage
    <<~TEXT
      Usage:
        scripts/gate-oracle.rb repo --check [--gem PATH]
        scripts/gate-oracle.rb testsuite --check [--gem PATH]
        scripts/gate-oracle.rb differential
        scripts/gate-oracle.rb --help
        scripts/gate-oracle.rb <subcommand> --help

      Subcommands:
        repo        Regenerate this repository's committed generated data into
                    temporary directories and diff it. A diff means this
                    repository's committed data is stale.
        testsuite   Regenerate the pinned plurimath-testsuite corpus into a
                    temporary directory and diff it. A diff means the testsuite
                    pin changed and should be moved, not that this repository's
                    generated data should be edited.
        differential
                    Generate a seeded, bounded batch of AsciiMath inputs and
                    render each through both the gem and this port. Detect and
                    count every divergence, print the first 20, and keep the
                    full count. Deterministic: the same --seed produces the
                    same batch, so a failure can be reproduced exactly.

      Oracle checkout resolution:
        1. --gem PATH
        2. #{ORACLE_ENV}=PATH
        3. otherwise fail
    TEXT
  end

  def repo_usage
    <<~TEXT
      Usage:
        scripts/gate-oracle.rb repo --check [--gem PATH]
        scripts/gate-oracle.rb repo --help

      Regenerates, into temporary directories only:
        - corpus/ and src/generated/ via scripts/generate-corpus.rb
        - src/core/generated/ via scripts/generate-core-data.rb
        - src/formatting/generated/ via scripts/generate-formatting-data.rb
        - every committed test/formats/<format>/parity-fixtures.json and its
          sidecar via
          scripts/generate-parity-fixtures.rb
        - every committed test/formats/<format>/degenerate-fixtures.json and
          its sidecar via
          scripts/probe-degenerate-slots.rb

      It compares those regenerated outputs against a clean temporary snapshot
      of this repository's committed HEAD, never against live directories in
      the working tree, and never by regenerating over committed files.
    TEXT
  end

  def testsuite_usage
    <<~TEXT
      Usage:
        scripts/gate-oracle.rb testsuite --check [--gem PATH]
        scripts/gate-oracle.rb testsuite --help

      Regenerates the pinned plurimath-testsuite corpus with that repository's
      own scripts/generate-corpus.rb into a temporary directory and diffs it
      against a clean temporary snapshot of the pinned corpus. A diff is a
      testsuite pin change, not a plurimath-ts generated-data change.
    TEXT
  end

  def run(argv)
    command = argv.shift

    case command
    when nil, "--help", "-h"
      puts usage
      0
    when "repo"
      run_repo(argv)
    when "testsuite"
      run_testsuite(argv)
    when "differential"
      run_differential(argv)
    else
      raise UsageError, "unknown subcommand #{command.inspect}\n\n#{usage}"
    end
  end

  def run_repo(argv)
    options = parse_check_options(argv, repo_usage)
    gem_dir = resolve_gem_dir(options[:gem])
    require_submodule_snapshot_prerequisites!

    Dir.mktmpdir("plurimath-ts-oracle-") do |tmp|
      snapshot_root = build_clean_repo_snapshot!(tmp)
      regenerated_root = File.join(tmp, "regenerated", "repo")
      FileUtils.mkdir_p(regenerated_root)

      run_generator!(
        File.join(snapshot_root, "scripts", "generate-corpus.rb"),
        [
          "--gem", gem_dir,
          "--out", File.join(regenerated_root, "corpus"),
          "--symbols-out", File.join(regenerated_root, "src", "generated"),
        ],
        chdir: snapshot_root,
        gem_dir: gem_dir,
      )
      run_generator!(
        File.join(snapshot_root, "scripts", "generate-core-data.rb"),
        [
          "--gem", gem_dir,
          "--out", File.join(regenerated_root, "src", "core", "generated"),
        ],
        chdir: snapshot_root,
        gem_dir: gem_dir,
      )
      run_generator!(
        File.join(snapshot_root, "scripts", "generate-formatting-data.rb"),
        [
          "--gem", gem_dir,
          "--out", File.join(regenerated_root, "src", "formatting", "generated"),
        ],
        chdir: snapshot_root,
        gem_dir: gem_dir,
      )

      file_comparisons = regenerate_format_fixtures!(snapshot_root, regenerated_root, gem_dir)

      comparisons = [
        ["corpus", File.join(snapshot_root, "corpus"), File.join(regenerated_root, "corpus")],
        ["src/generated", File.join(snapshot_root, "src", "generated"),
         File.join(regenerated_root, "src", "generated")],
        ["src/core/generated", File.join(snapshot_root, "src", "core", "generated"),
         File.join(regenerated_root, "src", "core", "generated")],
        ["src/formatting/generated", File.join(snapshot_root, "src", "formatting", "generated"),
         File.join(regenerated_root, "src", "formatting", "generated")],
      ]

      diffs = comparisons.filter_map do |label, committed, regenerated|
        diff_roots(label, committed, regenerated)
      end
      diffs += file_comparisons.filter_map do |label, committed, regenerated|
        diff_files(label, committed, regenerated)
      end

      if diffs.empty?
        puts "repo check passed: committed generated data matches a fresh regeneration from #{gem_dir}"
        return 0
      end

      warn "repo check failed: this repository's committed generated data is stale."
      warn "Regenerate this repository's data and commit the diff here; do not move the testsuite pin for this failure."
      diffs.each do |diff|
        warn
        warn diff
      end
      1
    end
  end

  # The per-format fixture generators, and the committed file each one writes.
  #
  # Both take `--oracle` rather than `--gem`; they load the pinned checkout
  # through $LOAD_PATH themselves instead of running under its Bundler alone.
  FORMAT_FIXTURE_GENERATORS = [
    {
      basename: "parity-fixtures.json",
      script: "generate-parity-fixtures.rb",
      # `--out` is the format ROOT; the script appends <format>/parity-fixtures.json.
      arguments: lambda do |format, regenerated_root|
        ["--format", format, "--out", File.join(regenerated_root, "test", "formats")]
      end,
    },
    {
      basename: "degenerate-fixtures.json",
      script: "probe-degenerate-slots.rb",
      # `--out` is the file itself.
      arguments: lambda do |format, regenerated_root|
        ["--format", format,
         "--out", File.join(regenerated_root, "test", "formats", format, "degenerate-fixtures.json")]
      end,
    },
  ].freeze

  # Regenerate every committed per-format fixture and return the file
  # comparisons for them.
  #
  # Which formats to run is DISCOVERED from the committed tree, never listed
  # here. A hand list is how the two HTML fixtures shipped outside this gate in
  # the first place: `repo --check` named three generators, the fixtures came
  # from two others, and neither was regenerated or compared by anything. An
  # empty discovery is a failure, not a quiet pass -- a check that regenerates
  # nothing proves nothing.
  def regenerate_format_fixtures!(snapshot_root, regenerated_root, gem_dir)
    FORMAT_FIXTURE_GENERATORS.flat_map do |generator|
      committed = Dir.glob(
        File.join(snapshot_root, "test", "formats", "*", generator[:basename]),
      ).sort
      if committed.empty?
        raise Error, "the snapshot holds no test/formats/*/#{generator[:basename]}; " \
                     "#{generator[:script]} would regenerate nothing"
      end

      committed.flat_map do |path|
        format = File.basename(File.dirname(path))
        committed_manifest = path.delete_suffix(".json") + ".manifest.yaml"
        unless File.file?(committed_manifest)
          raise Error, "#{path} has no adjacent sidecar at #{committed_manifest}"
        end
        FileUtils.mkdir_p(File.join(regenerated_root, "test", "formats", format))
        run_generator!(
          File.join(snapshot_root, "scripts", generator[:script]),
          ["--oracle", gem_dir, *generator[:arguments].call(format, regenerated_root)],
          chdir: snapshot_root,
          gem_dir: gem_dir,
        )
        regenerated_payload = File.join(
          regenerated_root, "test", "formats", format, generator[:basename],
        )
        regenerated_manifest = regenerated_payload.delete_suffix(".json") + ".manifest.yaml"
        [
          [
            "test/formats/#{format}/#{generator[:basename]}",
            path,
            regenerated_payload,
          ],
          [
            "test/formats/#{format}/#{File.basename(committed_manifest)}",
            committed_manifest,
            regenerated_manifest,
          ],
        ]
      end
    end
  end

  def run_testsuite(argv)
    options = parse_check_options(argv, testsuite_usage)
    gem_dir = resolve_gem_dir(options[:gem])
    require_submodule_snapshot_prerequisites!

    Dir.mktmpdir("plurimath-ts-oracle-") do |tmp|
      snapshot_root = build_clean_repo_snapshot!(tmp)
      testsuite_root = File.join(snapshot_root, SUBMODULE_RELATIVE_PATH)
      regenerated_root = File.join(tmp, "regenerated", "testsuite", "corpus")
      FileUtils.mkdir_p(regenerated_root)

      run_generator!(
        File.join(testsuite_root, "scripts", "generate-corpus.rb"),
        ["--gem", gem_dir, "--out", regenerated_root],
        chdir: testsuite_root,
        gem_dir: gem_dir,
      )

      diff = diff_roots(
        "#{SUBMODULE_RELATIVE_PATH}/corpus",
        File.join(testsuite_root, "corpus"),
        regenerated_root,
      )

      if diff.nil?
        puts "testsuite check passed: pinned corpus matches a fresh regeneration from #{gem_dir}"
        return 0
      end

      warn "testsuite check failed: the pinned plurimath-testsuite corpus changed under this oracle."
      warn "Fix this by moving the submodule pin, not by editing plurimath-ts generated data."
      warn
      warn diff
      1
    end
  end

  DIFFERENTIAL_DEFAULT_SEED = 20_260_818
  DIFFERENTIAL_DEFAULT_COUNT = 500

  def differential_usage
    <<~TEXT
      Usage:
        scripts/gate-oracle.rb differential [--gem PATH] [--seed N] [--count N]

      Generates a seeded batch of AsciiMath inputs, renders each through the
      oracle gem and through this port's built artifact, and reports every
      case where they disagree.

      A divergence is either side accepting what the other refused, or the two
      producing different bytes for a format. Both refusing is agreement: the
      gem's message text and this port's are different by design, so only the
      fact of refusal is compared, never its wording.

        --gem PATH   oracle checkout (default: $#{ORACLE_ENV})
        --seed N     PRNG seed (default: #{DIFFERENTIAL_DEFAULT_SEED})
        --count N    inputs to generate (default: #{DIFFERENTIAL_DEFAULT_COUNT})

      Deterministic by construction: the same seed and count produce the same
      inputs, so a reported divergence can be reproduced exactly rather than
      hunted for.
    TEXT
  end

  def parse_differential_options(argv)
    options = { gem: nil, seed: DIFFERENTIAL_DEFAULT_SEED, count: DIFFERENTIAL_DEFAULT_COUNT }
    rest = argv.dup

    until rest.empty?
      arg = rest.shift
      case arg
      when "--gem" then options[:gem] = File.expand_path(require_value!(rest, "--gem"))
      when /\A--gem=(.+)\z/ then options[:gem] = File.expand_path(Regexp.last_match(1))
      when "--seed" then options[:seed] = require_integer!(rest, "--seed")
      when /\A--seed=(.+)\z/ then options[:seed] = Integer(Regexp.last_match(1))
      when "--count" then options[:count] = require_integer!(rest, "--count")
      when /\A--count=(.+)\z/ then options[:count] = Integer(Regexp.last_match(1))
      when "--help", "-h"
        puts differential_usage
        exit 0
      else
        raise UsageError, "unknown option #{arg.inspect}\n\n#{differential_usage}"
      end
    end

    raise UsageError, "--count must be positive" unless options[:count].positive?

    options
  end

  def require_value!(rest, flag)
    raise UsageError, "missing value after #{flag}" if rest.empty?

    rest.shift
  end

  def require_integer!(rest, flag)
    Integer(require_value!(rest, flag))
  rescue ArgumentError
    raise UsageError, "#{flag} takes an integer"
  end

  def parse_check_options(argv, help_text)
    options = { gem: nil, check: false, help: false }
    rest = argv.dup

    until rest.empty?
      arg = rest.shift
      case arg
      when "--check"
        options[:check] = true
      when "--gem"
        raise UsageError, "missing path after --gem" if rest.empty?

        options[:gem] = File.expand_path(rest.shift)
      when /\A--gem=(.+)\z/
        options[:gem] = File.expand_path(Regexp.last_match(1))
      when "--help", "-h"
        options[:help] = true
      else
        raise UsageError, "unknown option #{arg.inspect}\n\n#{help_text}"
      end
    end

    if options[:help]
      puts help_text
      exit 0
    end
    raise UsageError, "--check is required\n\n#{help_text}" unless options[:check]

    options
  end

  # --- differential runner ---------------------------------------------------

  # The alphabet the generator draws from. Deliberately structure-heavy rather
  # than realistic: the divergences worth finding are in fences, scripts and
  # fractions, not in which Greek letter a symbol happens to be.
  #
  # `unitsml(` is absent on purpose. UnitsML is a deferred feature
  # (ARCHITECTURE.md §5) and the port renders it as plain text by design, so
  # generating it would report a divergence the project has already decided to
  # have — the exclusion manifest exists for exactly that reason.
  DIFFERENTIAL_ATOMS = %w[a b x y 1 2 42 alpha beta pi oo].freeze
  DIFFERENTIAL_BINARY = %w[+ - * / = < >].freeze
  DIFFERENTIAL_FENCES = [%w[( )], %w=[ ]=, %w[{ }], ["(:", ":)"]].freeze
  DIFFERENTIAL_UNARY = %w[sqrt sin cos log abs hat bar vec ul].freeze

  # One expression, drawn from `random` at the given depth. Depth is bounded
  # rather than probabilistic: an unbounded generator eventually emits input
  # deep enough to exhaust a stack, and a gate that sometimes dies on its own
  # input teaches nothing.
  def differential_expression(random, depth)
    return DIFFERENTIAL_ATOMS.sample(random: random) if depth <= 0

    case random.rand(7)
    when 0 then DIFFERENTIAL_ATOMS.sample(random: random)
    when 1
      "#{differential_expression(random, depth - 1)} " \
        "#{DIFFERENTIAL_BINARY.sample(random: random)} " \
        "#{differential_expression(random, depth - 1)}"
    when 2
      open, close = DIFFERENTIAL_FENCES.sample(random: random)
      "#{open}#{differential_expression(random, depth - 1)}#{close}"
    when 3
      "#{DIFFERENTIAL_UNARY.sample(random: random)}" \
        "(#{differential_expression(random, depth - 1)})"
    when 4
      "#{differential_expression(random, depth - 1)}^" \
        "(#{differential_expression(random, depth - 1)})"
    when 5
      "#{differential_expression(random, depth - 1)}_" \
        "(#{differential_expression(random, depth - 1)})"
    else
      "frac(#{differential_expression(random, depth - 1)})" \
        "(#{differential_expression(random, depth - 1)})"
    end
  end

  def differential_inputs(seed, count)
    random = Random.new(seed)
    Array.new(count) { differential_expression(random, random.rand(1..3)) }.uniq
  end

  # What the gem does with each input, in the same shape the port half reports.
  #
  # Run as a subprocess under the ORACLE's bundler, not in this process: this
  # script never loads plurimath itself, which is what lets it drive a gem
  # checkout it does not share a dependency set with.
  DIFFERENTIAL_GEM_SCRIPT = <<~RUBY
    require "plurimath"
    require "json"
    results = JSON.parse(STDIN.read).map do |input|
      begin
        f = Plurimath::Math.parse(input, :asciimath)
        { "ok" => true, "asciimath" => f.to_asciimath, "latex" => f.to_latex,
          "mathml" => f.to_mathml,
            "unicodemath" => f.to_unicodemath }
      rescue Plurimath::Math::ParseError
        # A REFUSAL. Only the fact of it is comparable: the gem re-raises its
        # parse failures as Math::ParseError with cause: nil, so its category
        # is coarser than the port's and matching on it would compare noise.
        { "ok" => false }
      rescue StandardError => e
        # NOT a refusal — a defect. A blanket rescue here turned any gem
        # NoMethodError or renderer crash into an ordinary "the gem refused
        # it", which then AGREED with a port refusal and was counted as
        # parity. Reported as its own outcome so it can never do that again.
        { "ok" => false, "defect" => e.class.name }
      end
    end
    STDOUT.write("<<<JSON>>>" + JSON.generate(results))
  RUBY

  # Neither half may run unbounded. `Open3.capture3` has no deadline, so a
  # stuck gem, a stuck renderer, or a stdin/stdout deadlock left this gate
  # running forever — it could not falsely pass, but it could never reach a
  # failing result either, which is the same thing to anyone waiting on CI.
  # "Bounded" was in this command's own description while nothing bounded it.
  DIFFERENTIAL_TIMEOUT_SECONDS = 300

  # Kills the child AND everything it spawned.
  #
  # `bundle exec ruby` is a process that execs another process, so killing the
  # direct pid can leave the real worker running — and a surviving descendant
  # holding the inherited pipes keeps this side blocked past the deadline it
  # just declared. `pgroup: true` makes the child a group leader so the whole
  # group can be signalled with a negative pid.
  def kill_process_tree(pid)
    Process.kill("KILL", -Process.getpgid(pid))
  rescue Errno::ESRCH, Errno::EPERM
    # Already gone, or not ours to signal; the join below settles it.
    nil
  end

  def capture_bounded(env, *command, stdin_data:, chdir:, label:)
    out = +""
    err = +""
    status = nil
    Open3.popen3(env, *command, chdir: chdir, pgroup: true) do |stdin, stdout, stderr, thread|
      # stdin is written on its OWN thread. Writing it inline looked harmless
      # and was the hole in this timeout: a child that stops reading fills the
      # pipe, `stdin.write` blocks forever, and execution never reaches the
      # `join` below — so the declared bound covered everything except the one
      # place most likely to hang. Reading stdout/stderr concurrently matters
      # for the mirror-image deadlock, where the child blocks writing output
      # that nobody is draining.
      writer = Thread.new do
        stdin.write(stdin_data)
      rescue Errno::EPIPE, IOError
        # The child died or closed stdin early; its exit status is the report.
        nil
      ensure
        begin
          stdin.close
        rescue IOError
          nil
        end
      end
      readers = [Thread.new { out << stdout.read }, Thread.new { err << stderr.read }]

      unless thread.join(DIFFERENTIAL_TIMEOUT_SECONDS)
        kill_process_tree(thread.pid)
        thread.join
        [writer, *readers].each { |t| t.join(5) || t.kill }
        raise Error,
              "the #{label} half did not finish within " \
              "#{DIFFERENTIAL_TIMEOUT_SECONDS}s and was killed"
      end

      # Bounded here too: the process has exited, so these must drain promptly,
      # but a descendant holding the pipe open would otherwise hang the join.
      [writer, *readers].each { |t| t.join(30) || t.kill }
      status = thread.value
    end
    [out, err, status]
  end

  def differential_gem_results(inputs, gem_dir)
    stdout, stderr, status = capture_bounded(
      { "BUNDLE_GEMFILE" => File.join(gem_dir, "Gemfile") },
      "bundle", "exec", "ruby", "-Ilib", "-e", DIFFERENTIAL_GEM_SCRIPT,
      stdin_data: JSON.generate(inputs), chdir: gem_dir, label: "gem"
    )
    raise Error, "the gem half failed (exit #{status.exitstatus}):\n#{stderr}" unless status.success?

    marker = stdout.index("<<<JSON>>>")
    raise Error, "the gem half produced no result:\n#{stdout[0, 400]}" unless marker

    assert_differential_shape!(JSON.parse(stdout[(marker + "<<<JSON>>>".length)..]), "gem", inputs)
  end

  def differential_port_results(inputs)
    stdout, stderr, status = capture_bounded(
      {}, "node", File.join(REPO_ROOT, "scripts", "differential-port.mjs"),
      stdin_data: JSON.generate(inputs), chdir: REPO_ROOT, label: "port"
    )
    raise Error, "the port half failed (exit #{status.exitstatus}):\n#{stderr}" unless status.success?

    assert_differential_shape!(JSON.parse(stdout), "port", inputs)
  end

  # The fail-open path this gate could not survive: a half that returns one
  # `{}` per input produces syntactically valid JSON with the right COUNT, and
  # every `results["ok"]` is then nil. `nil != nil` is false, so the
  # accept/reject branch does not fire, and `next unless gem["ok"]` skips the
  # input — so the run compares NOTHING and reports zero divergences.
  # Checking the count alone cannot see that; the shape has to be checked.
  DIFFERENTIAL_FORMATS = %w[asciimath latex mathml unicodemath].freeze
  DIFFERENTIAL_PORT_CODES = %w[PARSE_ERROR RENDER_ERROR MISSING_SYMBOL_DATA].freeze

  def assert_differential_shape!(results, label, inputs)
    unless %w[gem port].include?(label)
      raise Error, "unknown differential result label: #{label.inspect}"
    end
    unless results.is_a?(::Array) && results.length == inputs.length
      raise Error, "the #{label} half returned #{results.is_a?(::Array) ? results.length : results.class} " \
                   "results for #{inputs.length} inputs"
    end

    results.each_with_index do |result, index|
      unless result.is_a?(::Hash) && [true, false].include?(result["ok"])
        raise Error, "the #{label} half's result #{index} has no boolean \"ok\": #{result.inspect[0, 120]}"
      end
      if result["ok"]
        expected = ["ok", *DIFFERENTIAL_FORMATS].sort
        unless result.keys.sort == expected
          raise Error, "the #{label} half's accepted result #{index} has keys " \
                       "#{result.keys.sort.inspect}; expected #{expected.inspect}"
        end
        DIFFERENTIAL_FORMATS.each do |format|
          next if result[format].is_a?(::String)

          raise Error, "the #{label} half's result #{index} accepted the input but " \
                       "its #{format} is #{result[format].inspect[0, 60]}, not a string"
        end
      elsif label == "port"
        unless result.keys.sort == %w[code ok] && DIFFERENTIAL_PORT_CODES.include?(result["code"])
          raise Error, "the port half's rejected result #{index} must contain only a typed " \
                       "code (#{DIFFERENTIAL_PORT_CODES.join(', ')}): #{result.inspect[0, 120]}"
        end
      elsif label == "gem"
        unless [%w[ok], %w[defect ok]].include?(result.keys.sort)
          raise Error, "the gem half's rejected result #{index} has invalid keys: " \
                       "#{result.keys.sort.inspect}"
        end
        if result.key?("defect") && (!result["defect"].is_a?(::String) || result["defect"].empty?)
          raise Error, "the gem half's rejected result #{index} has an invalid defect: " \
                       "#{result["defect"].inspect}"
        end
      end
    end
    results
  end

  def differential_divergences(inputs, gem_results, port_results)
    inputs.each_with_index.filter_map do |input, index|
      gem = gem_results[index]
      port = port_results[index]

      # A gem DEFECT is not a refusal, and must never be scored as agreement
      # with one. Reported whatever the port did.
      if gem["defect"]
        next { "input" => input, "format" => "gem-defect",
               "detail" => "the gem raised #{gem["defect"]}, which is not a refusal" }
      end

      if gem["ok"] != port["ok"]
        accepted, refused = gem["ok"] ? %w[gem port] : %w[port gem]
        next { "input" => input, "format" => "accept/reject",
               "detail" => "#{accepted} accepted it, #{refused} refused it" }
      end
      next unless gem["ok"]

      # `select`, not `find`: this command counts every divergence before its
      # presentation layer prints the first 20. Stopping at the first differing
      # format made the count false — an input wrong in every format showed up
      # as one asciimath row.
      differing = DIFFERENTIAL_FORMATS.select { |name| gem[name] != port[name] }
      next if differing.empty?

      differing.map do |format|
        { "input" => input, "format" => format, "gem" => gem[format], "port" => port[format] }
      end
    end.flatten
  end

  def run_differential(argv)
    options = parse_differential_options(argv)
    gem_dir = resolve_gem_dir(options[:gem])
    assert_clean_checkout!(gem_dir, "gem")

    inputs = differential_inputs(options[:seed], options[:count])
    puts "differential: seed #{options[:seed]}, #{inputs.length} distinct inputs"

    port_results = differential_port_results(inputs)
    unless port_results.length == inputs.length
      raise Error, "asked the port about #{inputs.length} inputs and got " \
                   "#{port_results.length} answers"
    end

    gem_results = differential_gem_results(inputs, gem_dir)
    unless gem_results.length == inputs.length
      raise Error, "asked the gem about #{inputs.length} inputs and got " \
                   "#{gem_results.length} answers"
    end
    divergences = differential_divergences(inputs, gem_results, port_results)

    if divergences.empty?
      puts "differential: no divergences across #{inputs.length} inputs " \
           "(#{inputs.length * DIFFERENTIAL_FORMATS.length} comparisons)"
      return 0
    end

    puts "differential: #{divergences.length} divergence(s)"
    divergences.first(20).each do |divergence|
      puts "  #{divergence['input'].inspect} (#{divergence['format']})"
      if divergence["detail"]
        puts "    #{divergence['detail']}"
      else
        puts "    gem  #{divergence['gem'].inspect}"
        puts "    port #{divergence['port'].inspect}"
      end
    end
    puts "  ...and #{divergences.length - 20} more" if divergences.length > 20
    puts "Reproduce with: scripts/gate-oracle.rb differential --seed #{options[:seed]} " \
         "--count #{options[:count]}"
    1
  end

  def resolve_gem_dir(cli_path)
    gem_dir = cli_path || ENV[ORACLE_ENV]
    raise Error, "no oracle checkout configured; pass --gem PATH or set #{ORACLE_ENV}" unless gem_dir && !gem_dir.empty?

    gem_dir = File.expand_path(gem_dir)
    gemfile = File.join(gem_dir, "Gemfile")
    raise Error, "#{gemfile} does not exist; the oracle checkout must contain a Gemfile" unless File.file?(gemfile)

    gem_dir
  end

  def require_submodule_snapshot_prerequisites!
    unless File.file?(File.join(REPO_ROOT, ".gitmodules"))
      raise Error, "#{File.join(REPO_ROOT, '.gitmodules')} is missing; cannot locate #{SUBMODULE_RELATIVE_PATH}"
    end
    unless File.directory?(SUBMODULE_ROOT)
      raise Error, "#{SUBMODULE_ROOT} does not exist; initialize the plurimath-testsuite submodule first"
    end
    unless git_repository?(SUBMODULE_ROOT)
      raise Error, "#{SUBMODULE_ROOT} is not an initialized git checkout; run git submodule update --init --recursive"
    end
    unless File.file?(File.join(SUBMODULE_ROOT, "scripts", "generate-corpus.rb"))
      raise Error, "#{SUBMODULE_ROOT}/scripts/generate-corpus.rb is missing; the submodule looks incomplete"
    end
    unless File.file?(File.join(SUBMODULE_ROOT, "corpus", "provenance.yaml"))
      raise Error, "#{SUBMODULE_ROOT}/corpus/provenance.yaml is missing; the submodule corpus is not present"
    end
  end

  def build_clean_repo_snapshot!(tmp_root)
    # The generators reject dirty generator checkouts. Snapshotting HEAD lets
    # this gate compare committed data even while the live branch has
    # uncommitted implementation work in flight.
    snapshot_root = File.join(tmp_root, "snapshot")
    FileUtils.mkdir_p(snapshot_root)

    copy_git_entry!(REPO_ROOT, snapshot_root)
    extract_head_archive!(REPO_ROOT, snapshot_root)
    materialize_clean_submodule_snapshot!(snapshot_root)

    assert_clean_checkout!(snapshot_root, "repository snapshot")
    assert_clean_checkout!(File.join(snapshot_root, SUBMODULE_RELATIVE_PATH), "testsuite submodule snapshot")
    snapshot_root
  end

  def materialize_clean_submodule_snapshot!(snapshot_root)
    dest = File.join(snapshot_root, SUBMODULE_RELATIVE_PATH)
    FileUtils.rm_rf(dest) if File.exist?(dest)
    FileUtils.mkdir_p(dest)

    copy_git_entry!(SUBMODULE_ROOT, dest)
    extract_head_archive!(SUBMODULE_ROOT, dest)
  end

  def copy_git_entry!(source_root, dest_root)
    git_entry = File.join(source_root, ".git")
    raise Error, "#{git_entry} is missing" unless File.exist?(git_entry)

    if File.directory?(git_entry)
      FileUtils.cp_r(git_entry, File.join(dest_root, ".git"), preserve: true)
    else
      git_dir, stderr, status = capture_command(
        ["git", "-C", source_root, "rev-parse", "--absolute-git-dir"],
      )
      unless status.success?
        detail = stderr.lines.first&.strip
        suffix = detail && !detail.empty? ? ": #{detail}" : ""
        raise Error, "failed to resolve #{git_entry}#{suffix}"
      end

      git_dir = git_dir.strip
      raise Error, "git returned no directory for #{git_entry}" if git_dir.empty?

      # A submodule inside a linked worktree uses a relative gitdir pointer.
      # Copying that pointer below a temporary snapshot changes what it resolves
      # against, so write Git's canonical absolute directory instead.
      File.write(File.join(dest_root, ".git"), "gitdir: #{git_dir}\n")
    end
  end

  def extract_head_archive!(repo_root, dest_root)
    statuses = begin
      Open3.pipeline(
        ["git", "-C", repo_root, "archive", "--format=tar", "HEAD"],
        ["tar", "-xf", "-", "-C", dest_root],
      )
    rescue Errno::ENOENT => e
      # Ruby raises before the pipeline runs when a binary is not on PATH, so
      # this would otherwise escape as a stack trace rather than the exit 2 a
      # precondition failure owes the caller.
      raise Error, "git and tar are both required to snapshot #{repo_root} (#{e.message})"
    end
    # Open3.pipeline returns Process::Status objects, not threads — there is
    # no #value to wait on.
    return if statuses.all?(&:success?)

    raise Error, "failed to materialize a clean snapshot of #{repo_root} from HEAD"
  end

  def assert_clean_checkout!(repo_root, label)
    output, _stderr, status = capture_command(["git", "-C", repo_root, "status", "--porcelain"])
    raise Error, "git status failed for #{label} at #{repo_root}" unless status.success?

    dirty = output.lines.map(&:strip).reject(&:empty?)
    return if dirty.empty?

    raise Error, "#{label} is unexpectedly dirty after snapshotting: #{dirty.join(', ')}"
  end

  def git_repository?(path)
    _output, _stderr, status = capture_command(["git", "-C", path, "rev-parse", "--git-dir"])
    status.success?
  end

  def run_generator!(script, arguments, chdir:, gem_dir:)
    gemfile = File.join(gem_dir, "Gemfile")
    relative = script.delete_prefix("#{chdir}/")
    puts "▶ #{relative} #{arguments.join(' ')}"
    stdout, stderr, status = capture_command(
      ["mise", "x", "--", "bundle", "exec", "ruby", script, *arguments],
      chdir: chdir,
      env: { "BUNDLE_FROZEN" => "true", "BUNDLE_GEMFILE" => gemfile },
    )

    unless status.success?
      raise Error, <<~MESSAGE
        #{relative} failed with exit #{status.exitstatus}.
        stdout:
        #{indent_block(stdout)}
        stderr:
        #{indent_block(stderr)}
      MESSAGE
    end

    puts indent_block(stdout) unless stdout.empty?
    warn indent_block(stderr) unless stderr.empty?
  end

  def diff_roots(label, committed_root, regenerated_root)
    unless File.directory?(committed_root)
      raise Error, "committed #{label} root is missing at #{committed_root}"
    end
    unless File.directory?(regenerated_root)
      raise Error, "regenerated #{label} root is missing at #{regenerated_root}"
    end

    normalize_generating_commit!(committed_root)
    normalize_generating_commit!(regenerated_root)

    diff, _stderr, status = capture_command(["git", "--no-pager", "diff", "--no-index", "--", committed_root, regenerated_root])
    return nil if status.success?
    if status.exitstatus == 1
      return <<~TEXT.chomp
        #{label} differs:
        #{indent_block(diff)}
      TEXT
    end

    raise Error, "git diff --no-index failed while comparing #{label}"
  end

  # The same comparison for a single generated FILE.
  #
  # `diff_roots` cannot do this: the committed fixtures sit in test/formats/
  # beside the specs that read them, so a directory diff would report every
  # spec file as deleted. Payload bytes are compared exactly. For a sidecar,
  # only the generator repository commit is normalized for the same reason as
  # `diff_roots`; the oracle commit, generator inputs, environment, and payload
  # hash stay strict.
  def diff_files(label, committed_file, regenerated_file)
    raise Error, "committed #{label} is missing at #{committed_file}" unless File.file?(committed_file)
    unless File.file?(regenerated_file)
      raise Error, "regenerated #{label} is missing at #{regenerated_file}"
    end

    normalize_generating_commit_file!(committed_file)
    normalize_generating_commit_file!(regenerated_file)

    diff, _stderr, status = capture_command(
      ["git", "--no-pager", "diff", "--no-index", "--", committed_file, regenerated_file],
    )
    return nil if status.success?
    if status.exitstatus == 1
      return <<~TEXT.chomp
        #{label} differs:
        #{indent_block(diff)}
      TEXT
    end

    raise Error, "git diff --no-index failed while comparing #{label}"
  end

  # The manifests record `repository.commit` — the commit that generated the
  # data — so regenerating at any later commit changes it by construction, and
  # this check could never produce the empty diff TODO 7 asks for except when
  # run at the exact commit that last regenerated. That is a property of the
  # data, not a defect in it.
  #
  # So the field is blanked on both sides before comparison. Everything that
  # determines *what* was generated is still compared strictly: the generator
  # path and its sha256, the oracle version and commit, the engine, and every
  # payload byte. Only the record of *when* generation happened is normalized,
  # and only in these temporary copies — never in the repository.
  # Quoted or bare: this repository's manifests emit the hash bare, the
  # testsuite's provenance.yaml emits it quoted.
  GENERATING_COMMIT = /^(\s*)commit:\s*'?[0-9a-f]{40}'?\s*$/
  GENERATOR_KEY = /^(\s*)generator:\s*$/
  REPOSITORY_KEY = /^(\s*)repository:\s*$/

  # Both shapes of provenance file: `*.manifest.yaml` sidecars here, and the
  # testsuite corpus's own `provenance.yaml`.
  PROVENANCE_GLOBS = ["**/*.manifest.yaml", "**/provenance.yaml"].freeze

  # Blank ONLY `generator.repository.commit` — the commit that generated the
  # data, which changes by construction on every later regeneration.
  #
  # A manifest carries two `commit:` keys, and they mean opposite things:
  #
  #   generator:
  #     repository:
  #       commit: <this repo's HEAD when generated>   <- normalized
  #   oracle:
  #     commit: <the pinned gem commit>               <- compared strictly
  #
  # An earlier version matched any `commit:` line carrying a 40-hex hash, which
  # blanked the oracle commit too and would have let the gate accept data
  # regenerated from a DIFFERENT oracle — the one mismatch it exists to catch.
  # So the block is tracked structurally rather than pattern-matched: a
  # `commit:` is normalized only at the exact direct
  # `generator.repository.commit` path. The corpus and oracle carry their own
  # repository/commit records, and both must stay strict.
  def normalize_generating_commit!(root)
    PROVENANCE_GLOBS.flat_map { |pattern| Dir.glob(File.join(root, pattern)) }.uniq.each do |path|
      normalize_generating_commit_file!(path)
    end
  end

  def normalize_generating_commit_file!(path)
    return unless path.end_with?(".manifest.yaml") || File.basename(path) == "provenance.yaml"

    generator_indent = nil
    repository_indent = nil
    changed = false
    lines = File.readlines(path).map do |line|
      indent = line[/\A\s*/].length
      unless line.strip.empty?
        if generator_indent && indent <= generator_indent
          generator_indent = nil
          repository_indent = nil
        elsif repository_indent && indent <= repository_indent
          repository_indent = nil
        end
      end

      if (opener = GENERATOR_KEY.match(line)) && opener[1].empty?
        generator_indent = opener[1].length
        repository_indent = nil
        next line
      end

      if generator_indent && (opener = REPOSITORY_KEY.match(line)) &&
         opener[1].length == generator_indent + 2
        repository_indent = opener[1].length
        next line
      end

      if repository_indent && (found = GENERATING_COMMIT.match(line)) &&
         found[1].length == repository_indent + 2
        changed = true
        next "#{found[1]}commit: <normalized>\n"
      end

      line
    end
    File.write(path, lines.join) if changed
  end

  def capture_command(args, chdir: REPO_ROOT, env: {})
    Open3.capture3(env, *args, chdir: chdir)
  rescue Errno::ENOENT => e
    # Same reason as the pipeline above: a missing binary raises before the
    # command runs, and every caller here treats a failure as a precondition
    # failure worth naming rather than a stack trace.
    raise Error, "#{args.first} is required but could not be executed (#{e.message})"
  end

  def indent_block(text)
    body = text.to_s
    return "  (none)" if body.empty?

    body.lines.map { |line| "  #{line}" }.join
  end
end

begin
  exit OracleGate.run(ARGV)
rescue OracleGate::UsageError => e
  warn e.message
  exit 2
rescue OracleGate::Error => e
  warn "oracle: #{e.message}"
  exit 2
end
