# frozen_string_literal: true

# CI-only runner. All Git writes happen in the disposable verification checkout.
# Raw exports survive failed validation; report.json is the verification authority.
require "digest"
require "fileutils"
require "json"
require "open3"
require "optparse"
require "set"
require "yaml"
require "thread"

$stdout.sync = true

module OracleArtifacts
  PIN = "00c52783877b38f6b8e6e109f1803f96bb34fc62"
  LOCK_SHA = "a07b033c4e199d7324e2e0c6c15063df08f840f3234d3c874ede809d6750bed4"
  ROOTS = %w[corpus src/unitsml/generated src/generated src/core/generated src/formatting/generated
             src/formats/html/generated src/formats/latex/generated
             src/formats/mathml/generated src/formats/omml/generated
             src/formats/unicodemath/generated src/formats/html/generated-text
             src/formats/mathml/generated-recognition].freeze
  FORMATS = %w[asciimath html latex mathml omml unicodemath].freeze

  class Runner
    def initialize(source:, oracle:, verify:, out:, mode:)
      @source, @oracle, @verify, @out = [source, oracle, verify, out].map { |p| File.realpath(p) }
      raise "source, oracle, verification and artifact roots must be distinct" unless
        [@source, @oracle, @verify, @out].uniq.length == 4
      raise "artifact root must be outside all checkouts" if
        [@source, @oracle, @verify].any? { |p| @out.start_with?("#{p}/") }
      @env = { "BUNDLE_GEMFILE" => File.join(@oracle, "Gemfile"), "BUNDLE_FROZEN" => "true" }
      @report_mutex = Mutex.new
      @mode = mode
      @logs = File.join(@out, "logs")
      if @mode == "verify"
        @report = JSON.parse(File.read(File.join(@out, "report.json")))
        validate_resume!
      else
        raise "artifact output must be empty" unless Dir.children(@out).empty?
        @report = { "exported" => false, "verified" => false, "stages" => [],
                    "oracle" => PIN, "lockSha256" => LOCK_SHA,
                    "roots" => { "source" => @source, "oracle" => @oracle, "verify" => @verify, "out" => @out } }
        FileUtils.mkdir_p(@logs)
        save
      end
    end

    def save
      File.write(File.join(@out, "report.json"), JSON.pretty_generate(@report) + "\n")
    end

    def command(name, args, cwd: @source, env: {}, required: true)
      puts "#{name}: starting"
      log = File.join(@logs, "#{name}.log")
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      status = nil
      launch_error = nil
      begin
        File.open(log, "w") do |io|
          pid = Process.spawn(@env.merge(env), *args, chdir: cwd, out: io, err: io)
          _, status = Process.wait2(pid)
        end
      rescue SystemCallError => e
        launch_error = e.message
      end
      @report_mutex.synchronize do
      @report["stages"] << { "name" => name, "command" => args, "cwd" => cwd,
                            "exit" => status&.exitstatus, "signal" => status&.termsig, "launchError" => launch_error,
                            "seconds" => Process.clock_gettime(Process::CLOCK_MONOTONIC) - started }
      save
      end
      success = status&.success? == true
      puts "#{name}: #{success ? 'passed' : 'failed'} (exit #{status&.exitstatus.inspect}, signal #{status&.termsig.inspect})"
      raise "#{name} failed; see #{log}" if required && !success
      success
    end

    def git(cwd, *args)
      stdout, stderr, status = Open3.capture3("git", *args, chdir: cwd)
      raise "git #{args.first} failed: #{stderr}" unless status.success?
      stdout
    end

    def clean!(root)
      raise "dirty checkout: #{root}" unless git(root, "status", "--porcelain").empty?
    end

    def inventory(output)
      at = ->(path) { File.join(output, path) }
      jobs = [["corpus", "generate-corpus.rb", ["--gem", @oracle, "--out", at.call("corpus"),
                                                 "--symbols-out", at.call("src/generated")]]]
      { "core" => "core-data", "formatting" => "formatting-data", "formats/html" => "html-parser-data",
        "formats/latex" => "latex-parser-data", "formats/mathml" => "mathml-data",
        "formats/omml" => "omml-data", "formats/unicodemath" => "unicodemath-parser-data" }.each do |dir, script|
        jobs << [script, "generate-#{script}.rb", ["--gem", @oracle, "--out", at.call("src/#{dir}/generated")]]
      end
      jobs << ["unitsml-data", "generate-unitsml-data.rb", ["--oracle", @oracle, "--out", output]]
      { "html-text-data" => "src/formats/html/generated-text",
        "mathml-recognition-data" => "src/formats/mathml/generated-recognition" }.each do |name, dir|
        jobs << [name, "generate-#{name}.rb", ["--source-checkout", @oracle, "--out", at.call(dir)]]
      end
      FORMATS.each do |format|
        jobs << ["#{format}-model", "generate-#{format}-model-fixtures.rb",
                 ["--oracle", @oracle, "--out", at.call("test/formats/#{format}")]]
      end
      %w[html omml].each do |format|
        jobs << ["#{format}-parity", "generate-parity-fixtures.rb",
                 ["--oracle", @oracle, "--format", format, "--out", at.call("test/formats")]]
        jobs << ["#{format}-degenerate", "probe-degenerate-slots.rb",
                 ["--oracle", @oracle, "--format", format,
                  "--out", at.call("test/formats/#{format}/degenerate-fixtures.json")]]
      end
      { "asciimath-failure-positions" => "test/formats/asciimath", "cli-fixtures" => "test/formats/cli",
        "evaluation-fixtures" => "test/formats/evaluation", "render-options-fixtures" => "test/formats",
        "xml-fixtures" => "test/xml", "xml-reader-fixtures" => "test/xml" }.each do |script, dir|
        jobs << [script, "generate-#{script}.rb", ["--oracle", @oracle, "--out", at.call(dir)]]
      end
      jobs
    end

    def expected_paths
      files = git(@source, "ls-files", "-z").split("\0")
      roots = files.select { |path| ROOTS.any? { |root| path.start_with?("#{root}/") } }
      sidecars = files.grep(%r{\Atest/.*\.manifest\.yaml\z})
      raise "zero generated roots or sidecars" if roots.empty? || sidecars.empty?
      fixture_paths = sidecars.flat_map do |path|
        manifest = YAML.safe_load(File.read(File.join(@source, path)), aliases: false)
        payload = File.join(File.dirname(path), manifest.fetch("payload").fetch("path"))
        raise "untracked fixture payload: #{payload}" unless files.include?(payload)
        metadata = payload.sub(/\.json\z/, ".metadata.json")
        [path, payload] + (files.include?(metadata) ? [metadata] : [])
      end
      (roots + fixture_paths).uniq.sort
    end

    def omitted_family_paths
      @paths.select do |path|
        path.match?(%r{\Asrc/formats/(?:html|unicodemath)/generated/(?:parser-tables|transform-tables|provenance)\.ts\z}) ||
          path.start_with?("src/formats/html/generated-text/", "src/formats/mathml/generated-recognition/") ||
          path.match?(%r{\Atest/.*(?:cli-fixtures|evaluation-fixtures|render-options-fixtures|render-kinds-fixtures|ox-contract\.expected)\.(?:json|manifest\.yaml)\z})
      end
    end

    def generate(output, pass, env, jobs: inventory(output), paths: @paths)
      FileUtils.mkdir_p(output)
      run_job = ->(job) do
        name, script, args = job
        command("#{pass}-#{name}", ["bundle", "exec", "ruby", "scripts/#{script}", *args], env: env)
      end
      pending = jobs.dup
      # The corpus owns shared census/symbol inputs and always completes first.
      run_job.call(pending.shift) if pending.first&.first == "corpus"
      active_roots = []
      errors = []
      schedule = Mutex.new
      changed = ConditionVariable.new
      roots_for = lambda do |job|
        name, _, args = job
        if name == "unitsml-data"
          %w[src/unitsml/generated src/formats/unicodemath/generated
             test/formats/unitsml test/formats/unicodemath].map { |path| File.join(output, path) }
        else
          root = args[args.index("--out") + 1]
          root = File.dirname(root) if root.end_with?(".json")
          root = File.join(root, name.delete_suffix("-parity")) if name.end_with?("-parity")
          [root]
        end
      end
      overlap = ->(a, b) { a == b || a.start_with?("#{b}/") || b.start_with?("#{a}/") }
      workers = Array.new(3) do
        Thread.new do
          loop do
            job = schedule.synchronize { pending.shift }
            break unless job
            roots = roots_for.call(job)
            schedule.synchronize do
              changed.wait(schedule) while roots.any? { |root| active_roots.any? { |active| overlap.call(root, active) } }
              active_roots.concat(roots)
            end
            begin
              run_job.call(job)
            rescue StandardError => e
              schedule.synchronize { errors << e }
            ensure
              schedule.synchronize do
                roots.each { |root| active_roots.delete(root) }
                changed.broadcast
              end
            end
          end
        end
      end
      workers.each(&:join)
      workers.each(&:value)
      raise errors.first unless errors.empty?
      actual = Dir.glob("**/*", base: output).select { |p| File.file?(File.join(output, p)) }.sort
      raise "#{pass} output inventory mismatch: #{(actual.to_set ^ paths.to_set).to_a}" unless actual == paths
      clean!(@source)
      clean!(@oracle)
    end

    # Same sole volatile field as gate-oracle.rb; raw exports are never modified.
    def comparison_bytes(root, path)
      bytes = File.binread(File.join(root, path))
      return bytes unless path.end_with?(".manifest.yaml") || File.basename(path) == "provenance.yaml"
      generator_indent = repository_indent = nil
      bytes.lines.map do |line|
        indent = line[/\A\s*/].length
        unless line.strip.empty?
          if generator_indent && indent <= generator_indent
            generator_indent = repository_indent = nil
          elsif repository_indent && indent <= repository_indent
            repository_indent = nil
          end
        end
        if line.match?(/\Agenerator:\s*$/)
          generator_indent = 0
          repository_indent = nil
        elsif generator_indent && line.match?(/\A  repository:\s*$/)
          repository_indent = 2
        elsif repository_indent && indent == 4 && line.match?(/\A    commit:\s*'?[0-9a-f]{40}'?\s*$/)
          next "    commit: <normalized>\n"
        end
        line
      end.join
    end

    # Resume only the exact completed export. Validate before writing report/logs.
    def validate_resume!
      raise "not a completed unverified export" unless @report["exported"] == true &&
        @report["verified"] == false && !@report["verificationStarted"] && !@report.key?("error")
      raise "export roots changed" unless @report.fetch("roots") ==
        { "source" => @source, "oracle" => @oracle, "verify" => @verify, "out" => @out }
      raise "export oracle metadata changed" unless @report.fetch("oracle") == PIN && @report.fetch("lockSha256") == LOCK_SHA
      raise "export runtime changed" unless @report.fetch("ruby") == RUBY_DESCRIPTION
      [@source, @oracle, @verify].each { |root| clean!(root) }
      raise "export source changed" unless git(@source, "rev-parse", "HEAD").strip == @report.fetch("source")
      raise "export oracle changed" unless git(@oracle, "rev-parse", "HEAD").strip == PIN
      raise "export lock changed" unless Digest::SHA256.file(File.join(@oracle, "Gemfile.lock")).hexdigest == LOCK_SHA
      raise "export artifact commit changed" unless git(@verify, "rev-parse", "HEAD").strip == @report.fetch("artifactCommit")
      raise "export ancestry changed" unless git(@verify, "rev-parse", "HEAD^").strip == @report.fetch("source")
      @paths = expected_paths
      raise "export path inventory changed" unless JSON.parse(File.read(File.join(@out, "generated-paths.json"))) == @paths &&
        @report.fetch("payloads").keys.sort == @paths
      raw = File.join(@out, "raw-generated")
      actual = Dir.glob("**/*", base: raw).select { |p| File.file?(File.join(raw, p)) }.sort
      raise "export raw inventory changed" unless actual == @paths
      @paths.each do |path|
        digest = @report.fetch("payloads").fetch(path)
        [raw, @verify].each do |root|
          raise "export bytes changed: #{path}" unless Digest::SHA256.file(File.join(root, path)).hexdigest == digest
        end
      end
      changed = git(@verify, "diff", "--name-only", @report.fetch("source"), "HEAD").lines.map(&:strip)
      raise "export changed non-artifact paths" unless (changed - @paths).empty?
      @report.fetch("artifactDigests").each do |path, digest|
        raise "export transport changed: #{path}" unless %w[candidate.bundle generated.patch].include?(path) &&
          Digest::SHA256.file(File.join(@out, path)).hexdigest == digest
      end
      raise "export transport inventory changed" unless @report.fetch("artifactDigests").keys.sort == %w[candidate.bundle generated.patch]
      raise "export has failed stages" unless @report.fetch("stages").all? { |stage| stage.fetch("exit") == 0 && stage["signal"].nil? && stage["launchError"].nil? }
    end

    def run
      raise "requires Ruby 4.0.1" unless RUBY_VERSION == "4.0.1"
      [@source, @oracle, @verify].each { |root| clean!(root) }
      unless @mode == "verify"
        @report["source"] = git(@source, "rev-parse", "HEAD").strip
        raise "verification checkout differs from source" unless git(@verify, "rev-parse", "HEAD").strip == @report["source"]
        raise "wrong oracle pin" unless git(@oracle, "rev-parse", "HEAD").strip == PIN
        raise "oracle lockfile differs" unless Digest::SHA256.file(File.join(@oracle, "Gemfile.lock")).hexdigest == LOCK_SHA
        @report["ruby"] = RUBY_DESCRIPTION
        @report["submodule"] = git(@source, "rev-parse", "HEAD:submodules/plurimath-testsuite").strip
        @paths = expected_paths
        File.write(File.join(@out, "generated-paths.json"), JSON.pretty_generate(@paths) + "\n")
        save
        command("runtime-versions", ["bundle", "exec", "ruby", "-e", "require 'bundler'; abort unless Bundler::VERSION == '4.0.3'; puts RUBY_DESCRIPTION; puts Bundler::VERSION"])
        command("node-version", ["node", "--version"])
        command("source-node-install", ["pnpm", "install", "--frozen-lockfile"])
        raw = File.join(@out, "raw-generated")
        generate(raw, "first", { "TZ" => "UTC", "LC_ALL" => "C.UTF-8" })
        @paths.grep(/\.manifest\.yaml\z/).each do |path|
          manifest = YAML.safe_load(File.read(File.join(raw, path)), aliases: false)
          raise "non-committable export: #{path}" unless manifest.fetch("committable") == true
          raise "wrong exported oracle: #{path}" unless manifest.fetch("oracle").fetch("commit") == PIN
          raise "wrong exported lock: #{path}" unless
            manifest.fetch("dependencies").fetch("lockfile").fetch("sha256") == LOCK_SHA
        end
        @report["payloads"] = @paths.to_h { |p| [p, Digest::SHA256.file(File.join(raw, p)).hexdigest] }
        @paths.each do |path|
          target = File.join(@verify, path)
          FileUtils.mkdir_p(File.dirname(target))
          FileUtils.cp(File.join(raw, path), target)
        end
        command("artifact-stage", ["git", "add", "--", *@paths], cwd: @verify)
        command("artifact-commit", ["git", "-c", "user.name=Oracle artifact CI", "-c", "user.email=oracle-artifacts@example.invalid",
                                     "commit", "--allow-empty", "-m", "Regenerate oracle artifacts for verification"], cwd: @verify)
        @report["artifactCommit"] = git(@verify, "rev-parse", "HEAD").strip
        File.write(File.join(@out, "generated.patch"), git(@verify, "diff", "--binary", @report["source"], "HEAD", "--", *@paths))
        command("artifact-bundle", ["git", "bundle", "create", File.join(@out, "candidate.bundle"), "HEAD"], cwd: @verify)
        @report["artifactDigests"] = %w[candidate.bundle generated.patch].to_h do |path|
          [path, Digest::SHA256.file(File.join(@out, path)).hexdigest]
        end
        [@source, @oracle, @verify].each { |root| clean!(root) }
        @report["exported"] = true
        save
        return 0 if @mode == "export"
      end
      raw = File.join(@out, "raw-generated")
      @report["verificationStarted"] = true
      save
      # Equality and every validation retain their own exit; one failure cannot hide other evidence.
      equality = command("corpus-equality", ["bundle", "exec", "ruby", "scripts/probes/corpus-equality.rb", "--oracle", @oracle], cwd: @verify, required: false)
      legacy = command("oracle-repo-check", ["bundle", "exec", "ruby", "scripts/gate-oracle.rb", "repo", "--check", "--gem", @oracle], cwd: @verify, required: false)
      # The existing gate independently regenerates every other family. Re-run
      # only its omissions here, avoiding a third pass over the full corpus.
      second = File.join(@out, "second-generated")
      omitted_names = %w[html-parser-data unicodemath-parser-data html-text-data mathml-recognition-data
                         cli-fixtures evaluation-fixtures render-options-fixtures xml-fixtures]
      omitted_paths = omitted_family_paths
      raise "empty omitted-family inventory" if omitted_paths.empty?
      deterministic = false
      begin
        jobs = inventory(second).select { |name, _, _| omitted_names.include?(name) }
        generate(second, "second", { "TZ" => "Asia/Tokyo", "LC_ALL" => "C.UTF-8" }, jobs: jobs, paths: omitted_paths)
        differences = omitted_paths.reject { |path| comparison_bytes(raw, path) == comparison_bytes(second, path) }
        deterministic = differences.empty?
        File.write(File.join(@out, "determinism.json"), JSON.pretty_generate({ "compared" => omitted_paths.length,
          "differences" => differences, "remainingFamiliesCoveredBy" => "oracle-repo-check" }) + "\n")
      rescue StandardError => e
        @report["omittedFamilyError"] = e.message
        save
      end
      install = command("node-install", ["pnpm", "install", "--frozen-lockfile"], cwd: @verify, required: false)
      checks = install && command("pnpm-check", ["pnpm", "check"], cwd: @verify, required: false)
      unit = install && command("oracle-unit", ["pnpm", "test:oracle-unit"], cwd: @verify, required: false)
      raise "oracle lockfile changed" unless Digest::SHA256.file(File.join(@oracle, "Gemfile.lock")).hexdigest == LOCK_SHA
      [@source, @oracle, @verify].each { |root| clean!(root) }
      @report["verified"] = equality && legacy && deterministic && checks && unit
      save
      @report["verified"] ? 0 : 1
    rescue StandardError => e
      @report["error"] = "#{e.class}: #{e.message}"
      save
      warn @report["error"]
      1
    end
  end
end

if $PROGRAM_NAME == __FILE__
  options = { mode: "all" }
  OptionParser.new do |parser|
    parser.on("--mode MODE", %w[all export verify]) { |value| options[:mode] = value }
    %w[source oracle verify out].each { |name| parser.on("--#{name} PATH") { |value| options[name.to_sym] = value } }
  end.parse!
  abort "--source, --oracle, --verify and --out are required" unless options.keys.sort == %i[mode oracle out source verify]
  FileUtils.mkdir_p(options.fetch(:out))
  exit OracleArtifacts::Runner.new(**options).run
end
