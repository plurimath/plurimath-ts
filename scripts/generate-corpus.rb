# frozen_string_literal: true

# Generates the node census, the deferred-feature exclusion list and the
# per-format symbol data from the Ruby plurimath gem, which is the oracle
# (ARCHITECTURE.md §1).
#
# It does NOT generate the conformance cases. Those are shared with every other
# implementation and are owned by the `plurimath-testsuite` repository, whose
# own copy of this generator writes them; this repository consumes them through
# the submodule at submodules/plurimath-testsuite and reads them in TypeScript
# (TODO.plan/cross-cutting.md). Two generators for one payload is how the two
# drift apart. What is generated here is what the shared repository does not
# own: the census and the exclusion list classify the gem's classes against
# *this port's* roadmap, and the symbol data is TypeScript.
#
# The pinned cases are still read, to check what is generated here against them:
# a case in the pin that uses a deferred construct must be in the exclusion
# list, and every symbol the pin uses must have a generated descriptor.
#
# Usage, from the plurimath-ts repository root:
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile \
#     mise x -- bundle exec ruby scripts/generate-corpus.rb
#
# Options:
#   --gem PATH          gem checkout to treat as the oracle
#                       (default: the checkout bundler resolved `plurimath` from)
#   --out PATH          corpus output root (default: <repo>/corpus)
#   --symbols-out PATH  symbol-data output root (default: <repo>/src/generated)
#   --allow-dirty       generate from a dirty checkout; the output is marked
#                       non-committable in every sidecar manifest (§7)
#   --help
#
# Outputs (payload + sidecar manifest per payload, §7):
#   corpus/census.yaml              every Math::Core descendant, classified
#   corpus/exclusions.yaml          cases withheld because of a deferred feature
#   corpus/<payload>.manifest.yaml
#
# Symbol data (TypeScript, one file set per format — never one merged blob, so
# a renderer can bundle only its own slice, §3/§5):
#   src/generated/asciimath/input.ts       input text -> symbol id + literals
#   src/generated/asciimath/grammar.ts     the rule alternatives parse.rb builds
#   src/generated/asciimath/transform-registry.ts
#                                          every class name transform.rb can
#                                          reach, resolved through the gem
#   src/generated/asciimath/render-tables.ts
#                                          the three tables to_asciimath reads
#                                          that the parse tables cannot supply
#   src/generated/latex/render-tables.ts   the six measured tables to_latex
#                                          reads that no other slice supplies,
#                                          plus the census carrier name lists
#   src/generated/<format>/symbols.ts      symbol id -> static descriptor
#   src/generated/<format>/exceptions.ts   the context-axis exception matrix
#   src/generated/context-axes.ts          the probe manifest and its results
#   src/generated/provenance.ts            what the slices were generated from
#
# The generator is deterministic: two runs over the same oracle produce
# byte-identical output. No timestamps, no absolute paths, sorted keys.

require "plurimath"
require "digest"
require "fileutils"
require "yaml"

module CorpusGenerator
  REPO_ROOT = File.expand_path("..", __dir__)
  GENERATOR_PATH = "scripts/generate-corpus.rb"

  # 2 adds `defaults` (constructor-assigned field values) to each class entry.
  CENSUS_SCHEMA = "plurimath-corpus/census/2"
  EXCLUSIONS_SCHEMA = "plurimath-corpus/exclusions/1"
  MANIFEST_SCHEMA = "plurimath-corpus/manifest/1"

  INPUT_FORMAT = "asciimath"
  TARGET_FORMATS = %w[asciimath latex mathml].freeze

  # --- the pinned shared corpus --------------------------------------------

  # The submodule declared in .gitmodules. The cases it holds are read, never
  # written: plurimath-testsuite owns them.
  PIN_RELATIVE_PATH = "submodules/plurimath-testsuite"
  PIN_PROVENANCE_SCHEMA = "plurimath-corpus/provenance/2"
  SUBMODULE_FIX = "git submodule update --init --recursive"

  # --- symbol data ---------------------------------------------------------

  SYMBOL_NAMESPACE = "Math::Symbols::"
  SYMBOL_OUT_REL = "src/generated"

  # A symbol slice is only provable where the corpus can check it, so the
  # slices cover exactly the formats the corpus targets.
  # Symbol slices are generated for one more format than the corpus targets:
  # the UnicodeMath renderer is being built, and its symbol table is needed
  # before there is a corpus target to check it against. Keeping the two lists
  # separate is what lets those land in either order.
  SYMBOL_FORMATS = (TARGET_FORMATS + %w[unicodemath]).freeze

  # Roots that carry no static representation of their own. Declared here and
  # machine-checked in `assert_symbol_roots!`, never assumed.
  ABSTRACT_SYMBOL_IDS = %w[Paren].freeze
  DYNAMIC_SYMBOL_IDS = %w[Symbol].freeze

  # Values fed to a symbol node while probing. `Symbol` renders from its own
  # `value`, so it needs one; the value probe checks that no *other* class
  # does, which is what makes the emitted descriptors static.
  DYNAMIC_SYMBOL_PROBE_VALUE = "x"
  VALUE_PROBE = "zzvaluezz"

  # A symbol the host cannot influence, used to cancel a host template's own
  # output out of a hosted probe result.
  CONTROL_SYMBOL_VALUE = "zzprobezz"

  # The committed context-axis manifest (ARCHITECTURE.md §5). Probing cannot
  # discover an axis it does not exercise, so this list is reviewed rather than
  # inferred; a new upstream axis surfaces as a regeneration diff.
  CONTEXT_AXES = [
    {
      "name" => "intent",
      "values" => [false, true],
      "formats" => %w[mathml].freeze,
      "mechanism" => "the `intent` argument Formula#to_mathml threads down",
    },
    {
      "name" => "table",
      "values" => [false, true],
      "formats" => %w[asciimath latex mathml unicodemath].freeze,
      "mechanism" => "options[:table], which Td sets for a Formula cell",
    },
    {
      "name" => "rspace",
      "values" => [nil, "thickmathspace"],
      "formats" => %w[asciimath latex mathml unicodemath].freeze,
      "mechanism" => "the symbol node's own options[:rspace]",
    },
  ].freeze

  # Representative surroundings, so neighbour-dependent behaviour is exercised
  # and not only the isolated symbol (§5).
  HOST_TEMPLATES = [
    ["bare", "the symbol alone in a formula"],
    ["fenced", "the symbol inside a fenced group"],
    ["table-cell", "the symbol as the only cell of a one-by-one table"],
    ["binary-operand", "the symbol as the numerator of a fraction"],
  ].freeze

  # Biome formats every `.ts` in the repository and `pnpm lint` fails on a
  # formatting difference, so emitted lines must already be what Biome would
  # print — including where it breaks a value across lines. This is its print
  # width; the emitter makes the same fits/breaks decision, and a line that
  # still exceeds it (an unbreakable string) fails generation.
  TS_PRINT_WIDTH = 100

  # Deferred features are matched on the INPUT TEXT, never on a parsed class:
  # the gem raises while constructing an invalid UnitsML node, so no formula
  # exists to inspect for the rejection cases (ARCHITECTURE.md §5).
  DEFERRED_INPUT_PATTERNS = {
    "unitsml" => /unitsml\(/,
  }.freeze

  # Classes the port deliberately does not implement (§5). A deferred class may
  # never appear in a generated case; that invariant is checked, not assumed.
  DEFERRED_CLASSES = %w[
    Math::Function::Unitsml
  ].freeze

  # The direct `Math::Core` descendants. Each is a structural family the port
  # models in its own right. A new direct descendant is an unclassified new
  # family and fails generation.
  FAMILY_ROOTS = %w[
    Math::Formula
    Math::Function::BinaryFunction
    Math::Function::Nary
    Math::Function::Table
    Math::Function::TernaryFunction
    Math::Function::UnaryFunction
    Math::Function::Unitsml
    Math::Number
    Math::Symbols::Symbol
  ].freeze

  # Base classes the gem never instantiates. Declared, then machine-checked:
  # each must still have subclasses, must never be constructed anywhere in the
  # gem's own source, and must not appear in any generated case.
  ABSTRACT_CLASSES = %w[
    Math::Function::BinaryFunction
    Math::Function::TernaryFunction
    Math::Function::UnaryFunction
    Math::Symbols::Paren
  ].freeze

  # Receiver methods in an `==` body that test identity rather than compare a
  # field.
  EQUALITY_NON_FIELDS = %w[class is_a? kind_of? instance_of? respond_to?].freeze

  # Helpers an `==` body applies to the whole operand before comparing, mapped
  # to the field they read. An unlisted helper fails generation, so a new
  # upstream normalizer cannot silently drop a field from the projection.
  EQUALITY_WHOLE_OPERAND_HELPERS = {
    "comparable_value" => "value",
  }.freeze

  # Ivar prefixes `Core#variables` itself rejects: framework bookkeeping, not
  # model state.
  NON_FIELD_IVAR_PREFIXES = %w[@__ @lutaml].freeze
  NON_FIELD_IVARS = %w[@using_default].freeze

  # The seed inputs, mirroring the list plurimath-testsuite generates its cases
  # from. Only the withheld ones are used here — an input matching a deferred
  # pattern becomes an entry in `corpus/exclusions.yaml` — but the whole list is
  # kept because the exclusions must name the invalid inputs too, and those
  # produce no case in the pin: the gem raises while building the node, so there
  # is nothing there to withhold. `assert_pin_exclusions_complete!` checks this
  # list against the pin, so the two cannot drift apart silently.
  #
  # Ids are stable and hand-assigned: they are the join key between the shared
  # payload, the exclusion manifest, and the TypeScript suite, so they must not
  # move when a case is inserted.
  GROUPS = [
    ["numbers", "Integer and decimal literals", [
      ["number-integer", "2"],
      ["number-decimal", "2.5"],
      ["number-zero", "0"],
      ["number-multi-digit", "123"],
      ["number-decimal-long", "3.14159"],
    ]],
    ["symbols", "Bare identifiers, Greek letters and named constants", [
      ["symbol-latin-x", "x"],
      ["symbol-greek-alpha", "alpha"],
      ["symbol-greek-pi", "pi"],
      ["symbol-greek-sigma", "sigma"],
      ["symbol-infinity", "oo"],
      ["symbol-adjacent-letters", "xyz"],
      ["symbol-spaced-letters", "x y"],
    ]],
    ["operators", "Binary operators and implicit multiplication", [
      ["operator-plus", "x + y"],
      ["operator-implicit-product", "2x"],
      ["operator-asterisk", "a*b"],
      ["operator-minus", "a - b"],
      ["operator-equals", "x = y"],
      ["operator-plus-chain", "a + b + c"],
    ]],
    ["fences", "Fenced groups and separators", [
      ["fence-round-single", "(x)"],
      ["fence-round-expression", "(x+y)"],
      ["fence-square-pair", "[a,b]"],
      ["fence-curly-single", "{x}"],
      ["fence-round-triple", "(a,b,c)"],
      ["fence-over-number", "(x+y)/2"],
    ]],
    ["frac", "Fractions, written both with `/` and with `frac`", [
      ["frac-simple", "a/b"],
      ["frac-numeric", "2/3"],
      ["frac-fenced-numerator", "(a+b)/c"],
      ["frac-fenced-denominator", "x/(y+z)"],
      ["frac-sum-of-fracs", "a/b + c/d"],
      ["frac-explicit", "frac(a)(b)"],
    ]],
    ["powers", "Superscripts and subscripts", [
      ["power-square", "x^2"],
      ["power-fenced-exponent", "x^(n+1)"],
      ["subscript-digit", "a_1"],
      ["subscript-fenced", "a_(n+1)"],
      ["power-and-subscript", "x_1^2"],
      ["power-exponential", "e^x"],
      ["power-of-two", "2^10"],
      ["power-over-number", "x^2/4"],
    ]],
    ["roots", "Square roots and nth roots", [
      ["root-sqrt-number", "sqrt(2)"],
      ["root-sqrt-expression", "sqrt(x+1)"],
      ["root-sqrt-pythagoras", "sqrt(a^2 + b^2)"],
      ["root-cube", "root(3)(x+1)"],
    ]],
    ["unary-functions", "Unary functions, accented and fenced forms", [
      ["unary-sin-fenced", "sin(x)"],
      ["unary-sin-bare", "sin x"],
      ["unary-cos-product", "cos(2x)"],
      ["unary-abs", "abs(x)"],
      ["unary-hat", "hat(x)"],
      ["unary-bar", "bar(x)"],
      ["unary-vec", "vec(v)"],
    ]],
    ["quoted-text", "Literal text, quoted and via `text`", [
      ["text-function", "text(hello)"],
      ["text-quoted", "\"hello world\""],
      ["text-unitsml-valid", "\"unitsml(kg)\""],
      ["text-unitsml-invalid", "\"unitsml(zzz)\""],
    ]],
    ["nary", "n-ary operators and limit-bearing functions", [
      ["nary-log-base", "log_2 8"],
      ["nary-lim", "lim_(x->oo) f(x)"],
      ["nary-sum-bounded", "sum_(i=1)^n i"],
      ["nary-int-bounded", "int_0^1 x dx"],
      ["nary-prod-bounded", "prod_(k=1)^n k"],
      ["nary-sum-bare", "sum x"],
    ]],
    ["matrices", "Tables and matrices", [
      ["matrix-column", "((a),(b))"],
      ["matrix-two-by-two", "[[a,b],[c,d]]"],
    ]],
    ["mixed", "Whole expressions combining several features", [
      ["mixed-implicit-product", "2pi r"],
      ["mixed-greek-sequence", "alpha beta gamma"],
      ["mixed-function-definition", "f(x) = x^2"],
      ["mixed-binomial-square", "(x+y)^2 = x^2 + 2xy + y^2"],
      ["mixed-sum-of-cubes", "sum_(i=1)^n i^3=((n(n+1))/2)^2"],
    ]],
    ["whitespace", "Whitespace runs, which exercise one-character matching", [
      ["whitespace-around-operator", "x  +  y"],
      ["whitespace-between-letters", "a   b"],
      ["whitespace-in-subscript", "sum_(i = 1)^n  i"],
      ["whitespace-surrounding", " x "],
      ["whitespace-inside-fence", "sqrt( x )"],
    ]],
  ].freeze

  class Error < StandardError; end

  module_function

  # --- shell out to git, read-only ----------------------------------------

  def git(dir, *args)
    output = IO.popen(["git", "-C", dir, *args], err: File::NULL, &:read)
    raise Error, "git #{args.join(' ')} failed in #{dir}" unless $?.success?

    output
  end

  def git_repository?(dir)
    IO.popen(["git", "-C", dir, "rev-parse", "--git-dir"],
             err: File::NULL, &:read)
    $?.success?
  end

  # Paths under `except` are ignored. The generator's own output cannot make
  # the run unreproducible — it is overwritten — and excluding it is what lets
  # a committed corpus be regenerated and diffed (§7).
  def dirty_paths(dir, except: [])
    git(dir, "status", "--porcelain").lines.filter_map do |line|
      path = line[3..].to_s.strip
      path = path.split(" -> ").last.to_s.strip if path.include?(" -> ")
      path = path.delete_prefix('"').delete_suffix('"')
      next if except.any? { |p| path == p || path.start_with?("#{p}/") }

      path
    end.sort
  end

  # --- provenance ----------------------------------------------------------

  def sha256(content)
    Digest::SHA256.hexdigest(content)
  end

  def checkout_provenance(dir, dirty)
    {
      "commit" => git(dir, "rev-parse", "HEAD").strip,
      "clean" => dirty.empty?,
      "dirty_paths" => dirty,
    }
  end

  def lockfile_path(gem_dir)
    path = File.join(gem_dir, "Gemfile.lock")
    return path if File.file?(path)

    raise Error, <<~MESSAGE
      No Gemfile.lock in #{gem_dir}.
      Run `mise x -- bundle install` there first; §7 records its checksum.
    MESSAGE
  end

  # A deliberately small Gemfile.lock reader: enough to record each dependency
  # by source kind (§7), not a general lockfile parser.
  def parse_lockfile(path)
    sources = []
    specs = {}
    current = nil
    bundled_with = nil
    platforms = []
    in_specs = false
    in_bundled = false
    in_platforms = false

    File.readlines(path, chomp: true).each do |line|
      if line.match?(/\A\S/)
        in_specs = false
        in_bundled = line == "BUNDLED WITH"
        # Only PLATFORMS holds platform names. Without this, every indented
        # line of any unrecognised section (DEPENDENCIES, CHECKSUMS, ...) was
        # collected as a platform.
        in_platforms = line == "PLATFORMS"
        current = nil
        case line
        when "PATH", "GIT", "GEM"
          current = { "kind" => line.downcase, "specs" => [] }
          sources << current
        end
        next
      end

      if in_bundled
        bundled_with ||= line.strip
        next
      end

      if current
        if line.match?(/\A {2}\S+:/)
          # Split on ":" alone, not ": " — a bare "specs:" has no trailing
          # space, and splitting on ": " leaves the colon stuck to the key.
          key, value = line.strip.split(":", 2)
          value = value.to_s.strip
          in_specs = key == "specs"
          current[key] = value unless value.empty?
        elsif in_specs && line.match?(/\A {4}\S/)
          name, version = line.strip.match(/\A(\S+) \((.+)\)\z/)&.captures
          next unless name

          version, platform = version.split("-", 2)
          spec = { "name" => name, "version" => version,
                   "platform" => platform || "ruby", "source" => current }
          current["specs"] << name
          specs[name] = spec
        end
      elsif in_platforms && line.match?(/\A {2}\S/)
        platforms << line.strip
      end
    end

    { sources: sources, specs: specs, platforms: platforms.sort.uniq,
      bundled_with: bundled_with }
  end

  def dependency_provenance(gem_dir, gem_spec)
    path = lockfile_path(gem_dir)
    lock = parse_lockfile(path)

    external_path_sources = lock[:sources].select do |source|
      source["kind"] == "path" && source["remote"] != "."
    end

    direct = gem_spec.dependencies.select { |d| d.type == :runtime }
      .map(&:name).sort.map do |name|
      spec = lock[:specs][name]
      raise Error, "#{name} is not resolved in #{path}" unless spec

      entry = {
        "name" => spec["name"],
        "version" => spec["version"],
        "platform" => spec["platform"],
        "source_kind" => spec["source"]["kind"],
        "source" => spec["source"]["remote"],
      }
      entry["revision"] = spec["source"]["revision"] if spec["source"]["revision"]
      entry
    end

    {
      provenance: {
        "lockfile" => {
          "path" => "Gemfile.lock",
          "sha256" => sha256(File.binread(path)),
          "resolved_gems" => lock[:specs].size,
          "platforms" => lock[:platforms],
          "bundler" => lock[:bundled_with],
        },
        "sources" => lock[:sources].map do |source|
          # `.uniq` because a lockfile lists one spec per platform variant, and
          # this field records which gems a source provides, not how many
          # builds of each. Without it ffi and nokogiri appeared eight times
          # apiece — noise that makes a manifest diff unreadable for no
          # information gained.
          entry = { "kind" => source["kind"], "remote" => source["remote"],
                    "gems" => source["specs"].uniq.sort }
          entry["revision"] = source["revision"] if source["revision"]
          entry
        end,
        "direct_runtime" => direct,
      },
      external_path_sources: external_path_sources.map { |s| s["remote"] },
    }
  end

  def configuration_provenance
    configuration = Plurimath.configuration
    defaults = {
      "locale" => nil,
      "number_formatter" => nil,
      "evaluation_max_iterations" => Plurimath::Configuration::DEFAULT_MAX_ITERATIONS,
      "decimal" => Plurimath::Configuration::DEFAULT_DECIMAL,
    }
    actual = {
      "locale" => configuration.locale&.to_s,
      "number_formatter" => configuration.number_formatter&.class&.name,
      "evaluation_max_iterations" => configuration.evaluation_max_iterations,
      "decimal" => configuration.decimal,
    }
    actual.reject { |key, value| defaults[key] == value }
  end

  def require_ox_engine!
    engine = Plurimath.xml_engine
    return if engine.to_s == "Plurimath::XmlEngine::OxEngine"

    raise Error, <<~MESSAGE
      Canonical payloads are generated with Ox; this process loaded #{engine}.
      Unset PLURIMATH_OGA and re-run. Oga is a parity check only (§7).
    MESSAGE
  end

  # --- deferred features ---------------------------------------------------

  def deferred_feature_for(input)
    DEFERRED_INPUT_PATTERNS.find { |_feature, pattern| input.match?(pattern) }&.first
  end

  # Does the oracle raise on this input? Measured by asking it, because that
  # fact is what makes textual matching necessary for some deferred cases and
  # unnecessary for others — and because a generated file should record what
  # was observed, not what the generator's author believed.
  #
  # Deliberately broad in what it catches: any failure to produce a formula is
  # a raise for this purpose, and the distinction between error classes is not
  # one exclusions.yaml needs to carry.
  def gem_raises?(input)
    Plurimath::Math.parse(input, INPUT_FORMAT)
    false
  rescue StandardError, ScriptError
    true
  end

  # --- serialization -------------------------------------------------------

  def class_key(klass)
    klass.name.to_s.sub("Plurimath::", "")
  end

  def serialize_hash(hash, path)
    result = {}
    hash.each do |key, value|
      name = key.to_s
      raise Error, "duplicate key #{name.inspect} at #{path}" if result.key?(name)

      result[name] = serialize_value(value, "#{path}.#{name}")
    end
    result.sort.to_h
  end

  # Fails on an unrecognized type rather than falling back to `to_s`: an
  # unserializable field is a corpus gap, and a silent `to_s` would hide it.
  def serialize_value(value, path)
    case value
    when nil, true, false, ::String, ::Integer, ::Float then value
    when ::Symbol then value.to_s
    when ::Parslet::Slice then value.to_s
    when ::Array then value.each_with_index.map { |v, i| serialize_value(v, "#{path}[#{i}]") }
    when ::Hash then serialize_hash(value, path)
    when Plurimath::Math::Core then serialize_node(value, path)
    else
      raise Error, "cannot serialize #{value.class} at #{path}"
    end
  end

  def serialize_node(node, path)
    name = class_key(node.class)
    fields = node.variables.sort.to_h do |ivar|
      field = ivar.to_s.delete_prefix("@")
      [field, serialize_value(node.get(ivar), "#{path}.#{field}")]
    end
    { "class" => name, "fields" => fields }
  end

  # The Ruby class names in a `model:` block read back out of the pinned corpus.
  # A node is a mapping with a "class" and a "fields"; everything else is walked
  # through.
  def model_classes(value, acc = [])
    case value
    when ::Hash
      acc << value["class"] if value["class"].is_a?(::String) && value.key?("fields")
      value.each_value { |v| model_classes(v, acc) }
    when ::Array then value.each { |v| model_classes(v, acc) }
    end
    acc
  end

  # --- exclusions ----------------------------------------------------------

  def build_exclusions
    GROUPS.flat_map do |name, _description, cases|
      cases.filter_map do |id, input|
        feature = deferred_feature_for(input)
        next unless feature

        # Whether the gem raises on THIS input, measured rather than assumed.
        # It is the reason matching has to be textual at all — a raising input
        # yields no formula to classify — but it is not true of every excluded
        # case, and the earlier single reason string said it was. A reader of
        # exclusions.yaml was told that `"unitsml(kg)"`, which parses fine, had
        # raised.
        #
        # Recorded as a field rather than left to prose so a test can check it.
        # Prose cannot be verified; this can, and is: see
        # test/core/local-corpus.spec.ts, which cross-checks it against the
        # shared pin.
        raises = gem_raises?(input)

        {
          "id" => id,
          "group" => name,
          "input" => input,
          "input_format" => INPUT_FORMAT,
          "feature" => feature,
          "matched" => DEFERRED_INPUT_PATTERNS.fetch(feature).source,
          "raises" => raises,
          "reason" => if raises
                        "#{feature} is deferred (ARCHITECTURE.md §5). This input " \
                        "raises in the gem, so there is no formula to classify " \
                        "and the match is made on the input text"
                      else
                        "#{feature} is deferred (ARCHITECTURE.md §5). This input " \
                        "parses in the gem; it is withheld because the feature " \
                        "is deferred, not because anything failed"
                      end,
        }
      end
    end
  end

  # --- the pinned shared corpus, read-only ---------------------------------

  def pin_root
    File.join(REPO_ROOT, PIN_RELATIVE_PATH)
  end

  def missing_pin!(detail)
    raise Error, <<~MESSAGE
      The pinned corpus is not readable: #{detail}
      The shared conformance cases live in the #{PIN_RELATIVE_PATH} submodule,
      which this checkout has not initialised. Run: #{SUBMODULE_FIX}
    MESSAGE
  end

  # Reads every case in the pin, verifying each payload against the bytes and
  # digest `corpus/provenance.yaml` records. An uninitialised submodule raises
  # here rather than yielding an empty list, which would make every check below
  # pass while inspecting nothing.
  def read_pin_cases
    provenance_path = File.join(pin_root, "corpus", "provenance.yaml")
    missing_pin!("#{provenance_path} does not exist") unless File.exist?(provenance_path)

    provenance = YAML.safe_load(File.read(provenance_path), aliases: false)
    schema = provenance["schema"]
    unless schema == PIN_PROVENANCE_SCHEMA
      raise Error, "#{provenance_path}: schema is #{schema.inspect}, expected " \
                   "#{PIN_PROVENANCE_SCHEMA.inspect}"
    end
    unless provenance["committable"] == true
      raise Error, "#{provenance_path}: the pin is marked committable: false; it was " \
                   "not generated the canonical way (§7)"
    end
    unless provenance["xml_engine"] == "Plurimath::XmlEngine::OxEngine"
      raise Error, "#{provenance_path}: generated with #{provenance['xml_engine']}, " \
                   "not Ox (§7)"
    end

    payloads = provenance["payloads"] || []
    raise Error, "#{provenance_path} lists no payloads" if payloads.empty?

    cases = payloads.flat_map { |entry| read_pin_payload(entry) }
    raise Error, "the pin at #{pin_root} contains no cases" if cases.empty?

    cases
  end

  def read_pin_payload(entry)
    path = File.join(pin_root, "corpus", entry.fetch("path"))
    missing_pin!("#{path} is listed in corpus/provenance.yaml but is not on disk") unless
      File.exist?(path)

    bytes = File.binread(path)
    if bytes.bytesize != entry.fetch("bytes") || sha256(bytes) != entry.fetch("sha256")
      raise Error, "#{path} does not match corpus/provenance.yaml; the pinned corpus " \
                   "was edited in place. Restore it with " \
                   "`git -C #{PIN_RELATIVE_PATH} checkout .`"
    end

    document = YAML.safe_load(bytes, aliases: false)
    group = document["group"]
    raise Error, "#{path} declares no group" if group.nil? || group.empty?

    cases = document["cases"] || []
    raise Error, "#{path} has no cases" if cases.empty?

    cases.map { |kase| kase.merge("group" => group) }
  end

  # --- census --------------------------------------------------------------

  def all_descendants(klass, acc = [])
    (klass.descendants || []).sort_by(&:name).each do |descendant|
      acc << descendant
      all_descendants(descendant, acc)
    end
    acc
  end

  # Force-loads the autoloaded model namespaces so `descendants` is complete.
  def load_model_classes!(gem_dir)
    Dir.glob(File.join(gem_dir, "lib/plurimath/math/**/*.rb")).sort.each do |file|
      require file
    end
  end

  def source_body(path, line_index)
    lines = File.readlines(path, chomp: true)
    opening = lines[line_index]
    raise Error, "no source at #{path}:#{line_index + 1}" unless opening

    indent = opening[/\A\s*/]
    body = [opening]
    ((line_index + 1)...lines.length).each do |i|
      body << lines[i]
      break if lines[i] == "#{indent}end"
    end
    body
  end

  def class_body(klass)
    location = Object.const_source_location(klass.name)
    unless location && location.first
      raise Error, "cannot locate the source of #{klass.name}"
    end

    source_body(location.first, location.last - 1)
  end

  def declared_fields(klass)
    fields = []
    body = class_body(klass)
    collecting = false

    body.each do |line|
      if collecting
        fields.concat(line.scan(/:([a-z_][A-Za-z0-9_]*)/).flatten)
        collecting = line.rstrip.end_with?(",")
        next
      end

      if line.match?(/\A\s*attr_(accessor|reader|writer)\s/)
        fields.concat(line.scan(/:([a-z_][A-Za-z0-9_]*)/).flatten)
        collecting = line.rstrip.end_with?(",")
      end

      line.scan(/(@[a-z_][A-Za-z0-9_]*)\s*=(?![=~>])/).flatten.each do |ivar|
        next if NON_FIELD_IVARS.include?(ivar)
        next if NON_FIELD_IVAR_PREFIXES.any? { |prefix| ivar.start_with?(prefix) }

        fields << ivar.delete_prefix("@")
      end
    end

    fields.uniq.sort
  end

  # How many positional arguments a class's `initialize` demands. Everything
  # else has a default, which is exactly what the probe below is measuring.
  def required_argument_count(klass)
    klass.instance_method(:initialize).parameters.count { |kind, _| kind == :req }
  end

  # What `initialize` assigns when it is given nothing, **measured** by
  # instantiating the class and reading `variables`.
  #
  # Reading the source instead would get this wrong: assignment is routinely
  # conditional (`@options = options unless options.empty?`, `@slashed =
  # slashed if slashed`), the initializer is often inherited, and two sibling
  # classes guard the same field differently — `Overset` skips an empty
  # options hash where `Underset` stores it.
  #
  # The result keeps "never assigned" and "assigned nil" apart, because the
  # model does: Ruby serializes `instance_variables`, so an unassigned ivar is
  # absent from a node's serialization while an assigned nil is present.
  # `assigned` is therefore a mapping (a nil value is a real, emitted nil) and
  # `unassigned` the complementary list of declared fields.
  def construction_defaults(klass, fields)
    arity = required_argument_count(klass)
    key = class_key(klass)

    begin
      instance = klass.new(*::Array.new(arity, nil))
    rescue StandardError, ScriptError => e
      raise Error, <<~MESSAGE
        #{key}.new(#{(['nil'] * arity).join(', ')}) raised #{e.class}: #{e.message}.
        The census records each class's constructor defaults by instantiating it,
        so an implemented class the generator cannot build has no measurable
        default set. Either the class is not implementable as modelled, or it
        belongs in DEFERRED_CLASSES.
      MESSAGE
    end

    assigned = instance.variables.sort.to_h do |ivar|
      field = ivar.to_s.delete_prefix("@")
      [field, serialize_value(instance.get(ivar), "#{key}.#{field}")]
    end

    unknown = assigned.keys - fields
    unless unknown.empty?
      raise Error, <<~MESSAGE
        #{key}.new assigns #{unknown.join(', ')}, which `declared_fields` did not
        find. The field scanner and the constructor probe disagree, so one of
        them is wrong; fix the scanner rather than widening this check.
      MESSAGE
    end

    {
      "required_arguments" => arity,
      "assigned" => assigned,
      "unassigned" => (fields - assigned.keys).sort,
    }
  end

  def equality_owner(klass)
    owner = klass.instance_method(:==).owner
    owner < Plurimath::Math::Core || owner == Plurimath::Math::Core ? owner : nil
  end

  def equality_definition(owner)
    location = owner.instance_method(:==).source_location
    raise Error, "cannot locate #{owner.name}#==" unless location

    body = source_body(location.first, location.last - 1)
    source = body.join("\n")
    indent = body.first[/\A\s*/]
    trimmed = body.map { |line| line.start_with?(indent) ? line[indent.length..] : line }

    normalized = {}
    source.scan(/([a-z_][A-Za-z0-9_]*)\((?:object|other)&?\.([a-z_][A-Za-z0-9_]*)\)/)
      .each { |helper, field| normalized[field] = helper }
    source.scan(/([a-z_][A-Za-z0-9_]*)\((?:object|other)\)/).each do |(helper)|
      field = EQUALITY_WHOLE_OPERAND_HELPERS[helper]
      unless field
        raise Error, <<~MESSAGE
          #{owner.name}#== applies the unclassified helper `#{helper}` to the
          whole operand. Add it to EQUALITY_WHOLE_OPERAND_HELPERS with the field
          it reads, so the equality projection stays complete.
        MESSAGE
      end

      normalized[field] = helper
    end

    fields = source.scan(/(?:object|other)&?\.([a-z_][A-Za-z0-9_]*[?!]?)/).flatten
    fields -= EQUALITY_NON_FIELDS
    fields = (fields + normalized.keys).uniq.sort

    {
      "class" => class_key(owner),
      "compares_class" => source.match?(/(?:object|other)\.class\s*==|==\s*(?:object|other)\.class/),
      "calls_super" => source.match?(/(?<![.\w])super(?![\w])/) ? true : false,
      "own_fields" => fields,
      "normalized_by" => normalized.sort.to_h,
      "source" => trimmed.join("\n"),
    }
  end

  # Every `==` an entry can reach, including the ancestors its `super` calls
  # delegate to, flattened to the fields each projection effectively compares.
  def equality_definitions(classes)
    pending = classes.filter_map { |klass| equality_owner(klass) }.uniq
    definitions = {}

    until pending.empty?
      owner = pending.shift
      key = class_key(owner)
      next if definitions.key?(key)

      definition = equality_definition(owner)
      definitions[key] = definition
      next unless definition["calls_super"]

      parent = equality_owner(owner.superclass)
      unless parent
        raise Error, "#{owner.name}#== calls super outside the model hierarchy"
      end

      definition["super"] = class_key(parent)
      pending << parent
    end

    definitions.each_key do |key|
      definitions[key]["fields"] = effective_equality_fields(definitions, key)
    end
    definitions.sort.to_h
  end

  def effective_equality_fields(definitions, key, seen = [])
    raise Error, "cyclic super chain at #{key}" if seen.include?(key)

    definition = definitions.fetch(key)
    fields = definition["own_fields"].dup
    if definition["super"]
      fields += effective_equality_fields(definitions, definition["super"], seen + [key])
    end
    fields.uniq.sort
  end

  def abstract_check!(gem_dir, descendants)
    by_key = descendants.to_h { |klass| [class_key(klass), klass] }
    sources = Dir.glob(File.join(gem_dir, "lib/**/*.rb")).sort
      .map { |file| File.read(file) }

    ABSTRACT_CLASSES.each do |key|
      klass = by_key[key]
      raise Error, "declared-abstract #{key} is not a Math::Core descendant" unless klass

      if (klass.descendants || []).empty?
        raise Error, "declared-abstract #{key} has no subclasses; reclassify it"
      end

      short = klass.name.split("::").last
      pattern = /(?<![A-Za-z0-9_])#{Regexp.escape(short)}\.new(?![A-Za-z0-9_])/
      next unless sources.any? { |source| source.match?(pattern) }

      raise Error, "declared-abstract #{key} is instantiated in the gem; reclassify it"
    end
  end

  def build_census(gem_dir)
    descendants = all_descendants(Plurimath::Math::Core).uniq
    abstract_check!(gem_dir, descendants)

    direct = Plurimath::Math::Core.descendants.map { |k| class_key(k) }.uniq.sort
    unknown = direct - FAMILY_ROOTS
    unless unknown.empty?
      raise Error, <<~MESSAGE
        Unclassified new model #{unknown.length == 1 ? 'family' : 'families'}: #{unknown.join(', ')}.
        A direct Math::Core descendant is a structural family the port must
        model. Add it to FAMILY_ROOTS once its disposition is decided.
      MESSAGE
    end

    definitions = equality_definitions(descendants)
    own_fields = descendants.to_h { |klass| [klass, declared_fields(klass)] }

    inherited_fields = lambda do |klass|
      fields = []
      current = klass.superclass
      while current && current != Plurimath::Math::Core
        fields += own_fields.fetch(current, [])
        current = current.superclass
      end
      fields.uniq
    end

    own_equality = descendants.to_h { |klass| [klass, equality_owner(klass) == klass] }
    new_fields = descendants.to_h do |klass|
      [klass, own_fields.fetch(klass) - inherited_fields.call(klass)]
    end

    disposition_of = lambda do |klass|
      key = class_key(klass)
      if DEFERRED_CLASSES.include?(key) then "deferred"
      elsif FAMILY_ROOTS.include?(key) then "implemented"
      elsif !new_fields.fetch(klass).empty? || own_equality.fetch(klass) then "implemented"
      else "aliased"
      end
    end

    all_fields = descendants.to_h do |klass|
      [klass, (own_fields.fetch(klass) + inherited_fields.call(klass)).uniq.sort]
    end

    # Deferred classes are not probed: the port does not model them, and
    # `Unitsml.new(nil)` raises inside the upstream parser.
    defaults = descendants.reject { |klass| DEFERRED_CLASSES.include?(class_key(klass)) }
      .to_h { |klass| [klass, construction_defaults(klass, all_fields.fetch(klass))] }

    entries = descendants.sort_by(&:name).map do |klass|
      disposition = disposition_of.call(klass)
      entry = {
        "name" => class_key(klass),
        "parent" => class_key(klass.superclass),
        "disposition" => disposition,
        "abstract" => ABSTRACT_CLASSES.include?(class_key(klass)),
        "direct_subclasses" => (klass.descendants || []).uniq.length,
      }

      if disposition == "aliased"
        target = klass.superclass
        target = target.superclass while disposition_of.call(target) == "aliased"
        entry["aliases"] = class_key(target)
        # An aliased class adds no field and no equality, but it may still
        # override `initialize` — `FontStyle::Bold` defaults parameter_two to
        # "bold", `Table::Matrix` to round parens. The port folds these classes
        # into their alias target, so a diverging default set is recorded here
        # rather than assumed away.
        own = defaults[klass]
        entry["defaults"] = own if own && own != defaults[target]
      else
        owner = equality_owner(klass)
        entry["fields"] = all_fields.fetch(klass)
        entry["own_fields"] = new_fields.fetch(klass)
        entry["equality"] = {
          "defined_by" => class_key(owner),
          "fields" => definitions.fetch(class_key(owner))["fields"],
        }
        entry["defaults"] = defaults[klass] if defaults.key?(klass)
      end

      entry
    end

    counts = entries.group_by { |e| e["disposition"] }.transform_values(&:length)

    {
      "schema" => CENSUS_SCHEMA,
      "root" => class_key(Plurimath::Math::Core),
      "policy" => {
        "dispositions" => {
          "implemented" => "The port models this class: it is a family root, " \
                           "adds a field, or compares differently from its parent.",
          "aliased" => "Adds no field and no equality of its own; the port " \
                       "represents it as its alias target plus a name.",
          "deferred" => "Deliberately not implemented (ARCHITECTURE.md §5). " \
                        "A deferred class may not appear in any generated case.",
        },
        "defaults" => {
          "measured_by" => "instantiating the class with no arguments (nil for " \
                           "each required positional) and reading `variables`",
          "assigned" => "field => the value `initialize` assigned. A field " \
                        "present with a nil value was assigned nil and is " \
                        "serialized; a field absent from this mapping was never " \
                        "assigned and is omitted from a node's serialization. " \
                        "The two are different states and must not be collapsed.",
          "unassigned" => "the declared fields `initialize` never touches, listed " \
                          "so the distinction above is explicit rather than " \
                          "inferred from an absent key",
          "required_arguments" => "positional arguments `initialize` demands; the " \
                                  "probe passes nil for each",
          "on_aliased_entries" => "present only when the aliased class's own " \
                                  "`initialize` produces a different default set " \
                                  "from its alias target's",
          "not_recorded_for" => "deferred classes, which the port does not model",
        },
        "fails_generation_on" => [
          "a direct Math::Core descendant that is not a declared family root",
          "a declared-abstract class that has no subclasses or is instantiated " \
          "in the gem",
          "a class whose source, fields or `==` cannot be read",
          "an `==` helper applied to the whole operand that is not classified",
          "a deferred class appearing in a generated corpus case",
          "a non-deferred class that cannot be instantiated for the " \
          "constructor-default probe",
          "a constructor assigning an instance variable the field scanner missed",
        ],
        "family_roots" => FAMILY_ROOTS,
        "abstract" => ABSTRACT_CLASSES,
        "deferred" => DEFERRED_CLASSES,
      },
      "summary" => {
        "total" => entries.length,
        "implemented" => counts.fetch("implemented", 0),
        "aliased" => counts.fetch("aliased", 0),
        "deferred" => counts.fetch("deferred", 0),
        "abstract" => entries.count { |e| e["abstract"] },
        "concrete" => entries.count { |e| !e["abstract"] },
      },
      "equality_definitions" => definitions,
      "classes" => entries,
    }
  end

  # --- symbol classes ------------------------------------------------------

  def symbol_root
    Plurimath::Math::Symbols::Symbol
  end

  def symbol_classes
    all_descendants(symbol_root).uniq.sort_by(&:name)
  end

  def symbol_id(klass)
    class_key(klass).delete_prefix(SYMBOL_NAMESPACE)
  end

  # The declared roots must still *be* roots: no input text of their own, and
  # subclasses that do the real work. A root that grows an INPUT table has
  # become a symbol and needs a descriptor, so generation stops.
  def assert_symbol_roots!(classes)
    by_id = classes.to_h { |klass| [symbol_id(klass), klass] }
    by_id[symbol_id(symbol_root)] = symbol_root

    (ABSTRACT_SYMBOL_IDS + DYNAMIC_SYMBOL_IDS).each do |id|
      klass = by_id[id]
      raise Error, "symbol root #{id} is not in the hierarchy" unless klass

      unless klass::INPUT.empty?
        raise Error, "#{id} now declares INPUT; it is a symbol, not a bare root"
      end

      next unless (klass.descendants || []).empty?

      raise Error, "#{id} has no subclasses; reclassify it"
    end
  end

  # Classes that get a static descriptor: everything except the roots.
  def static_symbol_classes(classes)
    excluded = ABSTRACT_SYMBOL_IDS + DYNAMIC_SYMBOL_IDS
    classes.reject { |klass| excluded.include?(symbol_id(klass)) }
  end

  def symbol_instance(klass, rspace: nil, value: nil)
    klass.new(value, nil, options: rspace ? { rspace: rspace } : {})
  end

  # --- static representation per format ------------------------------------

  def representation(klass, format, combo, value: nil)
    node = symbol_instance(klass, rspace: combo["rspace"], value: value)
    options = combo["table"] ? { table: true } : {}

    case format
    when "asciimath" then node.to_asciimath(options: options)
    when "latex" then node.to_latex(options: options)
    when "unicodemath" then node.to_unicodemath(options: options)
    when "mathml"
      mathml_descriptor(
        klass,
        node.to_mathml_without_math_tag(combo["intent"], options: options),
      )
    else raise Error, "unknown target format #{format.inspect}"
    end
  end

  # The descriptor is a *static representation*, not final output: one element,
  # its attributes, and its text. Anything richer would mean the renderer
  # cannot be the only place output is assembled, so it fails generation.
  def mathml_descriptor(klass, element)
    unless element.respond_to?(:name) && element.respond_to?(:nodes)
      raise Error, "#{symbol_id(klass)} rendered to #{element.class}, not an element"
    end

    nodes = element.nodes
    unless nodes.length == 1 && nodes.first.is_a?(::String)
      raise Error, <<~MESSAGE
        #{symbol_id(klass)} renders <#{element.name}> holding #{nodes.length} node(s).
        The mathml descriptor models exactly one text node; widen the schema.
      MESSAGE
    end

    {
      "tag" => element.name,
      "text" => nodes.first,
      "attributes" => element.attributes.to_h { |key, value| [key.to_s, value.to_s] }.sort.to_h,
    }
  end

  # --- context-axis probe --------------------------------------------------

  # An axis the format's API cannot express is pinned to its first value rather
  # than dropped, so every format's combinations carry the same axis names.
  def axis_combinations(format)
    CONTEXT_AXES
      .map do |axis|
        values = axis["formats"].include?(format) ? axis["values"] : [axis["values"].first]
        values.map { |value| [axis["name"], value] }
      end
      .reduce([[]]) { |acc, pairs| acc.product(pairs).map { |combo, pair| combo + [pair] } }
      .map(&:to_h)
  end

  # The axes whose value actually changes the output: for each axis, hold every
  # other axis fixed and look for a difference. This is the whole point of the
  # probe — "does the class override a render method" selects 1,460 of 1,461
  # classes and therefore means nothing (§5).
  def varying_axes(results)
    results.keys.first.keys.select do |axis|
      results
        .group_by { |combo, _| combo.reject { |name, _| name == axis } }
        .any? { |_, group| group.map(&:last).uniq.length > 1 }
    end
  end

  def context_variants(results, axes)
    results.group_by { |combo, _| combo.slice(*axes) }.map do |context, group|
      values = group.map(&:last).uniq
      if values.length > 1
        raise Error, "context #{context.inspect} still yields #{values.length} outputs; " \
                     "varying-axis detection missed an axis"
      end

      { "when" => context, "value" => values.first }
    end.sort_by { |variant| axes.map { |axis| variant["when"][axis].to_s } }
  end

  # Probe A: the symbol's own render method, in isolation. Exact — every
  # difference is the symbol's, with no host to attribute it to.
  def probe_direct(classes, value: nil)
    findings = {}

    classes.each do |klass|
      SYMBOL_FORMATS.each do |format|
        results = axis_combinations(format).to_h do |combo|
          [combo, representation(klass, format, combo, value: value)]
        end
        axes = varying_axes(results)
        next if axes.empty?

        entry = findings[symbol_id(klass)] ||= {}
        entry[format] = { "axes" => axes, "variants" => context_variants(results, axes) }
      end
    end

    findings
  end

  def host_formula(template, node)
    symbols = Plurimath::Math::Symbols
    function = Plurimath::Math::Function
    formula = Plurimath::Math::Formula

    case template
    when "bare"
      formula.new([node])
    when "fenced"
      formula.new([function::Fenced.new(symbols::Paren::Lround.new, [node],
                                        symbols::Paren::Rround.new)])
    when "table-cell"
      formula.new([function::Table.new([function::Tr.new([function::Td.new([formula.new([node])])])])])
    when "binary-operand"
      formula.new([function::Frac.new(formula.new([node]),
                                      formula.new([Plurimath::Math::Number.new("2")]))])
    else raise Error, "unknown host template #{template.inspect}"
    end
  end

  def render_host(format, template, node, combo)
    formula = host_formula(template, node)
    options = combo["table"] ? { table: true } : {}

    case format
    when "asciimath" then formula.to_asciimath(options: options)
    when "latex" then formula.to_latex(options: options)
    when "mathml" then formula.to_mathml(intent: combo["intent"])
    when "unicodemath" then formula.to_unicodemath(options: options)
    else raise Error, "unknown target format #{format.inspect}"
    end
  rescue Error
    # The generator's own errors are bugs, not probe results. Rescuing them
    # alongside the gem's turned a missing format arm into 5,848 recorded
    # "probe failures" and let the run finish: the count looked like a finding
    # about UnicodeMath and was a finding about this method.
    raise
  rescue StandardError => e
    { "error" => e.class.name }
  end

  # What the probed symbol contributed to a host render, obtained by cancelling
  # out the part the control symbol produced identically. Without this every
  # symbol looks context-dependent, because the *hosts* react to `intent`.
  def contribution(output, control)
    return output unless output.is_a?(::String) && control.is_a?(::String)

    head = 0
    head += 1 while head < output.length && head < control.length &&
                    output[head] == control[head]
    tail = 0
    tail += 1 while tail < (output.length - head) && tail < (control.length - head) &&
                    output[output.length - 1 - tail] == control[control.length - 1 - tail]

    output[head...(output.length - tail)]
  end

  def control_outputs
    cache = {}
    HOST_TEMPLATES.each do |template, _description|
      SYMBOL_FORMATS.each do |format|
        axis_combinations(format).each do |combo|
          node = symbol_root.new(CONTROL_SYMBOL_VALUE)
          cache[[template, format, combo]] = render_host(format, template, node, combo)
        end
      end
    end
    cache
  end

  # Probe B: the same axes, but with the symbol placed inside each committed
  # host template, so neighbour-dependent behaviour is exercised too.
  def probe_hosted(classes)
    control = control_outputs
    findings = {}
    failures = []

    classes.each do |klass|
      id = symbol_id(klass)
      HOST_TEMPLATES.each do |template, _description|
        SYMBOL_FORMATS.each do |format|
          results = axis_combinations(format).to_h do |combo|
            node = symbol_instance(klass, rspace: combo["rspace"])
            output = render_host(format, template, node, combo)
            if output.is_a?(::Hash)
              failures << {
                "id" => id, "format" => format, "template" => template,
                "context" => context_label(combo), "error" => output["error"]
              }
            end
            [combo, contribution(output, control[[template, format, combo]])]
          end

          axes = varying_axes(results)
          next if axes.empty?

          entry = (findings[id] ||= {})
          format_entry = (entry[format] ||= { "axes" => [], "templates" => [] })
          format_entry["axes"] = (format_entry["axes"] + axes).uniq.sort
          format_entry["templates"] = (format_entry["templates"] + [template]).uniq
        end
      end
    end

    [findings, failures.sort_by { |f| [f["id"], f["format"], f["template"], f["context"]] }]
  end

  def context_label(combo)
    combo.map { |name, value| "#{name}=#{value.nil? ? 'none' : value}" }.join(" ")
  end

  # Classes whose output depends on the node's own `value`. Parsed symbols never
  # carry one (`Utility.symbols_class` calls `klass.new` with no arguments), so
  # this is not a context axis — but a hand-built node may set it, and the
  # renderer has to know which classes read it.
  def probe_value_dependence(classes)
    baseline = { "intent" => false, "table" => false, "rspace" => nil }

    classes.filter_map do |klass|
      formats = SYMBOL_FORMATS.select do |format|
        representation(klass, format, baseline) !=
          representation(klass, format, baseline, value: VALUE_PROBE)
      end
      next if formats.empty?

      { "id" => symbol_id(klass), "formats" => formats }
    end
  end

  # --- asciimath input tables ----------------------------------------------

  # The gem orders these longest-first with `sort_by { -length }`, whose tie
  # order Ruby does not define. Two equal-length literals can never both match
  # at one position, so re-sorting inside a length group is semantically inert —
  # do it, and prove that only the tie order moved.
  def longest_first(name, pairs)
    lengths = pairs.map { |key, _| key.length }
    unless lengths == lengths.sort.reverse
      raise Error, "the gem no longer orders #{name} longest-first"
    end

    sorted = stable_order(pairs)
    unless sorted.map { |key, _| key.length } == lengths
      raise Error, "re-sorting #{name} moved an entry across length groups"
    end

    sorted
  end

  def stable_order(pairs)
    pairs.sort_by { |key, _| [-key.length, key] }
  end

  def asciimath_input_tables(classes)
    known = classes.to_h { |klass| [klass, symbol_id(klass)] }
    id_for = lambda do |klass|
      known.fetch(klass) { raise Error, "input maps to unknown class #{klass}" }
    end

    symbols = Plurimath::Utility.symbols_hash(INPUT_FORMAT.to_sym)
    parens = Plurimath::Utility.parens_hash(INPUT_FORMAT.to_sym)
    literals = Plurimath::Asciimath::Constants.precompile_constants

    # `Utility.all_symbols_classes` is symbols merged with parens, parens last,
    # and that merged table is what the transform resolves input through. Ruby's
    # `merge` appends the new paren keys, so the merged table is *not* ordered —
    # it is only ever looked up by key, so it is emitted in canonical order.
    # Called for its assertions: the source tables must still be longest-first,
    # even though only the literal list's order is semantic.
    longest_first("symbols_hash", symbols.map { |text, klass| [text, id_for.call(klass)] })
    paren_pairs = longest_first("parens_hash",
                                parens.map { |text, klass| [text, id_for.call(klass)] })
    merged = symbols.merge(parens)
    collisions = (symbols.keys & parens.keys).sort.map do |input|
      [input, id_for.call(symbols[input]), id_for.call(parens[input])]
    end

    {
      # `symbols_hash` is not emitted separately: it is the merged table minus
      # the paren inputs, with the collisions below restoring the three keys
      # both tables claim.
      "input" => stable_order(merged.map { |text, klass| [text, id_for.call(klass)] }),
      "paren_inputs" => paren_pairs.map(&:first),
      "collisions" => collisions,
      "literals" => longest_first("precompile_constants",
                                  literals.map { |text, kind| [text, kind.to_s] }),
      "literal_kinds" => literals.values.map(&:to_s).uniq.sort,
      "skip_input_parens" => Plurimath::Asciimath::Constants::SKIP_INPUT_PARENS.to_a,
      "counts" => {
        "symbols" => symbols.length,
        "parens" => parens.length,
        "merged" => merged.length,
        "literals" => literals.length,
      },
    }
  end

  # --- asciimath grammar tables --------------------------------------------

  # The five `Asciimath::Constants` that `Asciimath::Parse` turns into rule
  # alternatives. Twenty entries in total — which is exactly why they are
  # generated rather than typed: grammar-shaping data comes from the oracle, and
  # twenty hand-typed entries drift silently the first time upstream edits one.
  #
  # Every check below is a property the grammar depends on, so an upstream
  # change that breaks one stops generation instead of producing a grammar that
  # parses differently.
  GRAMMAR_CLASS_CONSTANTS = {
    "ternaryClasses" => :TERNARY_CLASSES,
    "binaryClasses" => :BINARY_CLASSES,
    "subSupClasses" => :SUB_SUP_CLASSES,
  }.freeze

  GRAMMAR_PAREN_CONSTANTS = {
    "tableParenthesis" => :TABLE_PARENTHESIS,
    "parenthesis" => :PARENTHESIS,
  }.freeze

  def asciimath_grammar_tables
    constants = Plurimath::Asciimath::Constants
    classes = GRAMMAR_CLASS_CONSTANTS.transform_values do |name|
      grammar_class_list(name, constants.const_get(name))
    end
    parens = GRAMMAR_PAREN_CONSTANTS.transform_values do |name|
      grammar_paren_pairs(name, constants.const_get(name))
    end

    assert_grammar_classes_disjoint!(classes)
    assert_table_parens_agree!(parens)

    tables = classes.merge(parens)
    tables.merge("counts" => tables.transform_values(&:length))
  end

  # `power_base_rules` reduces the three class lists into one ordered choice
  # (`sub_sup_classes | binary_classes | ternary_classes`, parse.rb:82-84), so
  # order inside a list is behaviour and the emitted array preserves the gem's
  # insertion order rather than sorting it.
  def grammar_class_list(name, list)
    raise Error, "#{name} is #{list.class}; expected an Array" unless list.is_a?(::Array)
    raise Error, "#{name} is empty; the grammar rule it builds would match nothing" if list.empty?

    wrong = list.reject { |entry| entry.is_a?(::String) }
    raise Error, "#{name} holds non-strings: #{wrong.inspect}" unless wrong.empty?

    duplicates = list.tally.select { |_, count| count > 1 }.keys
    unless duplicates.empty?
      raise Error, "#{name} repeats #{duplicates.join(', ')}; an ordered choice would never reach the second one"
    end

    list.dup
  end

  # Emitted as ordered pairs, never as separate key and value lists. `open_table`
  # reads the keys and `close_table` the values (parse.rb:47-52), but `read_text`
  # looks the closing paren up *by* the captured opening one at parse time
  # (parse.rb:181) — split the hash in two and that mapping is gone, and the two
  # halves are free to drift.
  def grammar_paren_pairs(name, hash)
    raise Error, "#{name} is #{hash.class}; expected a Hash" unless hash.is_a?(::Hash)
    raise Error, "#{name} is empty; the grammar rule it builds would match nothing" if hash.empty?

    pairs = hash.map do |open, close|
      unless open.is_a?(::Symbol) && close.is_a?(::String)
        raise Error, "#{name} pair #{open.inspect} => #{close.inspect} is not Symbol => String"
      end

      [open.to_s, close]
    end

    # `read_text` builds `match("[^#{rparen}]")` — a character class. A closing
    # paren of any other length silently becomes a different class.
    long = pairs.map(&:last).reject { |close| close.length == 1 }
    unless long.empty?
      raise Error, <<~MESSAGE
        #{name} has multi-character closing parens (#{long.inspect}).
        `Parse#read_text` interpolates one into `match("[^...]")`, so a longer
        close would change that character class instead of matching literally.
      MESSAGE
    end

    %w[opening closing].zip([pairs.map(&:first), pairs.map(&:last)]).each do |side, values|
      duplicates = values.tally.select { |_, count| count > 1 }.keys
      next if duplicates.empty?

      raise Error, "#{name} repeats the #{side} paren #{duplicates.join(', ')}; the pairing is ambiguous"
    end

    pairs
  end

  def assert_grammar_classes_disjoint!(classes)
    shared = classes.keys.combination(2).flat_map do |left, right|
      (classes[left] & classes[right]).map { |entry| "#{entry} (#{left}, #{right})" }
    end
    return if shared.empty?

    raise Error, <<~MESSAGE
      The grammar class lists overlap: #{shared.join(', ')}.
      `power_base_rules` reduces all three into one ordered choice
      (parse.rb:82-84), so a shared entry makes the later list unreachable.
    MESSAGE
  end

  def assert_table_parens_agree!(parens)
    all = parens.fetch("parenthesis").to_h
    disagreeing = parens.fetch("tableParenthesis").reject do |open, close|
      all.fetch(open, close) == close
    end
    return if disagreeing.empty?

    raise Error, <<~MESSAGE
      TABLE_PARENTHESIS and PARENTHESIS disagree on #{disagreeing.map(&:first).join(', ')}.
      A table's parens are matched from the first table and read back through the
      second (parse.rb:47-52 and :181), so the two must map an opening paren to
      the same closing one.
    MESSAGE
  end

  # --- asciimath transform class registry ----------------------------------

  # The transform builds most nodes by *name*: `Utility.get_class(text)` turns
  # matched input into a constant path at runtime. The port replaces that with
  # an explicit registry (`src/formats/asciimath/registry.ts`, TODO.plan
  # p1/05), whose completeness must be asserted against a generated list
  # rather than by hand. This section measures that list: every name the
  # transform can hand to `get_class`, plus the two Utility tables its actions
  # read (`FONT_STYLES` and `UNARY_CLASSES`), each resolved through the gem to
  # the class it actually names. Resolution is measured, never derived by
  # capitalizing: `overbrace`, `underbrace` and `underline` resolve through
  # constant aliases (`Overbrace = Obrace`, ...) to classes whose names do not
  # match the input.
  TRANSFORM_SOURCE_FILES = %w[
    lib/plurimath/asciimath/transform.rb
    lib/plurimath/asciimath/utility.rb
  ].freeze
  PARSE_SOURCE_FILE = "lib/plurimath/asciimath/parse.rb"

  # Where each measured name came from. `unary_class`, `binary_class` and
  # `ternary_class` are the grammar capture tags whose token ranges are
  # enumerable (see `transform_capture_ranges`); `literal` is a quoted
  # `get_class` argument; `utility_unary_classes` and `font_styles` are the
  # two Utility tables the actions read.
  TRANSFORM_CAPTURE_KEYS = %w[unary_class binary_class ternary_class].freeze

  # `Utility` inside transform.rb resolves lexically to
  # Plurimath::Asciimath::Utility. The measured ranges assume it still
  # delegates `get_class` and both tables to the generic Plurimath::Utility;
  # an override upstream would silently change what the names resolve
  # through, so it stops generation instead.
  def transform_utility!
    utility = Plurimath::Asciimath::Utility
    unless utility < Plurimath::Utility
      raise Error, "Asciimath::Utility no longer subclasses Plurimath::Utility"
    end
    unless utility.method(:get_class).owner == Plurimath::Utility.singleton_class
      raise Error, "Asciimath::Utility overrides get_class; re-measure the registry ranges"
    end
    unless utility::FONT_STYLES.equal?(Plurimath::Utility::FONT_STYLES) &&
        utility::UNARY_CLASSES.equal?(Plurimath::Utility::UNARY_CLASSES)
      raise Error, "Asciimath::Utility shadows FONT_STYLES or UNARY_CLASSES; " \
                   "the transform no longer reads the generic tables"
    end
    utility
  end

  # Every `get_class(...)` argument in the transform sources, mechanically.
  # A literal argument is recorded as itself; an identifier is resolved to the
  # rule-pattern capture that binds it, because the capture's tag names the
  # token range the identifier can hold. Every call closes its parenthesis on
  # its own line in the gem today, and the scan verifies that by counting.
  def transform_call_sites(gem_dir)
    literals = []
    captures = []

    TRANSFORM_SOURCE_FILES.each do |relative|
      lines = File.readlines(File.join(gem_dir, relative), chomp: true)
      expected = lines.join("\n").scan("get_class").length
      found = 0

      lines.each_with_index do |line, index|
        line.scan(/get_class\(\s*(?:"([^"]*)"|'([^']*)'|([a-z_][a-z0-9_]*))\s*\)/) do |dq, sq, identifier|
          found += 1
          if identifier
            key = capture_key_for(lines, index, identifier, "#{relative}:#{index + 1}")
            captures << { "file" => relative, "line" => index + 1,
                          "identifier" => identifier, "key" => key }
          else
            literals << { "file" => relative, "line" => index + 1, "name" => dq || sq }
          end
        end
      end

      next if found == expected

      raise Error, <<~MESSAGE
        #{relative}: #{expected} get_class mention(s), #{found} parsed.
        A call now spans lines or takes an unrecognized argument shape, so the
        mechanical extraction no longer sees every call site. Widen the scan.
      MESSAGE
    end

    { "literals" => literals, "captures" => captures }
  end

  # The rule-pattern tag that binds `identifier` in the rule enclosing
  # `line_index`. The header runs from the nearest `rule(` line to the line
  # opening the block, and binds each capture as `tag: simple(:name)` (or
  # sequence/subtree).
  def capture_key_for(lines, line_index, identifier, where)
    start = line_index.downto(0).find { |i| lines[i].match?(/\A\s*rule\(/) }
    raise Error, "#{where}: get_class(#{identifier}) outside any rule" unless start

    header = []
    (start..line_index).each do |i|
      header << lines[i]
      break if lines[i].match?(/\bdo\z|\{/)
    end

    keys = header.join("\n")
      .scan(/([a-z_][a-z0-9_]*):\s*(?:simple|sequence|subtree)\(:#{Regexp.escape(identifier)}\)/)
      .flatten.uniq
    unless keys.length == 1
      raise Error, "#{where}: get_class(#{identifier}) binds to #{keys.length} " \
                   "captures in its rule header; expected exactly one"
    end

    keys.first
  end

  # What each capture tag can hold, measured from the grammar's own sources:
  # parse.rb tags the three Constants class lists via
  # `arr_to_expression(Constants::X, :tag)` (sub_sup and binary share
  # `:binary_class`), and tags every `precompile_constants` literal of kind
  # `:unary_class` via `dynamic_parser_rules` -> `unary_functions`. A capture
  # feeding `get_class` outside these tags has no enumerable range and fails
  # generation rather than being guessed at.
  def transform_capture_ranges(gem_dir)
    source = File.read(File.join(gem_dir, PARSE_SOURCE_FILE))
    constants = Plurimath::Asciimath::Constants

    tagged = Hash.new { |hash, key| hash[key] = [] }
    source.scan(/arr_to_expression\(Constants::([A-Z_]+)(?:\.\w+)?,\s*:([a-z_]+)\)/) do |name, tag|
      tagged[tag] << name
    end
    %w[binary_class ternary_class].each do |tag|
      next unless tagged[tag].empty?

      raise Error, "#{PARSE_SOURCE_FILE} no longer tags any class list :#{tag}"
    end
    unless source.include?(".as(:unary_class)")
      raise Error, "#{PARSE_SOURCE_FILE} no longer captures :unary_class; " \
                   "the unary range cannot be enumerated from the grammar"
    end

    by_kind = constants.precompile_constants.group_by { |_, kind| kind }
      .transform_values { |pairs| pairs.map(&:first) }
    unary = by_kind.fetch(:unary_class) do
      raise Error, "precompile_constants has no :unary_class literals"
    end

    {
      "unary_class" => unary,
      "binary_class" => tagged["binary_class"].flat_map { |name| constants.const_get(name) },
      "ternary_class" => tagged["ternary_class"].flat_map { |name| constants.const_get(name) },
      "fonts" => by_kind.fetch(:fonts, []),
    }
  end

  def resolve_transform_class(utility, name)
    klass = begin
      utility.get_class(name)
    rescue StandardError, ScriptError => e
      raise Error, "get_class(#{name.inspect}) raised #{e.class}: #{e.message}; " \
                   "a reachable name must resolve"
    end
    unless klass.is_a?(::Class) && klass < Plurimath::Math::Core
      raise Error, "get_class(#{name.inspect}) resolved to #{klass}, " \
                   "which is not a Math::Core descendant"
    end

    klass
  end

  # --- constructor families ------------------------------------------------

  # Which Ruby `initialize` shape a `get_class`-resolved class has — what the
  # port's transform dispatches its draft builders on. Measured, never read
  # from source (PORTING-STANDARDS.md): constructors guard (`@options =
  # options unless options.empty?`), coerce (`UnaryFunction` turns a Slice
  # into its text) and are routinely inherited, so the truth lives on the
  # runtime. Each family below is keyed by the exact ivar map a zero-argument
  # `new` leaves behind — Ruby keeps "assigned nil" and "never assigned"
  # apart, which is what makes the map a fingerprint — and every match is then
  # re-verified by `verify_constructor_family!` with sentinel arguments.
  TRANSFORM_FAMILY_SHAPES = {
    { "parameter_one" => nil } => "unary",
    { "attributes" => {}, "parameter_one" => nil } => "unaryAttributes",
    { "lang" => nil, "parameter_one" => "" } => "text",
    { "parameter_one" => nil, "parameter_two" => nil } => "binary",
    { "options" => {}, "parameter_one" => nil,
      "parameter_two" => nil } => "binaryAssignedOptions",
    { "parameter_one" => nil, "parameter_two" => nil,
      "parameter_three" => nil } => "ternary",
  }.freeze

  # The emitted union, in glossary order (registry.ts documents what each
  # family means operationally).
  TRANSFORM_FAMILIES = %w[
    unary unaryAttributes text binary binaryAssignedOptions ternary
  ].freeze

  # How many positional `initialize` slots each family may have: the base
  # classes take exactly their parameters, and the option-carrying subclasses
  # (`Frac`, `Overset`; `Sum`, `Int`, `Prod`, `Oint`) add one trailing
  # options slot that an empty hash must NOT survive (`Underset` is the one
  # class where it does, which is its own family).
  TRANSFORM_FAMILY_SLOTS = {
    "unary" => [1],
    "unaryAttributes" => [2],
    "text" => [1],
    "binary" => [2, 3],
    "binaryAssignedOptions" => [3],
    "ternary" => [3, 4],
  }.freeze

  TRANSFORM_SLICE_SENTINEL = "plurimath"

  # A real Parslet::Slice, produced by parsing rather than by constructing one
  # (Slice#initialize's signature is parslet's private business).
  def transform_sentinel_slice
    @transform_sentinel_slice ||= begin
      slice = Parslet::Atoms::Str.new(TRANSFORM_SLICE_SENTINEL)
        .parse(TRANSFORM_SLICE_SENTINEL)
      unless slice.is_a?(Parslet::Slice)
        raise Error, "parslet no longer parses to a Slice (got #{slice.class}); " \
                     "the Slice-conversion probe below would prove nothing"
      end

      slice
    end
  end

  def transform_family_ivars(instance)
    instance.variables.sort.to_h do |ivar|
      [ivar.to_s.delete_prefix("@"), instance.get(ivar)]
    end
  end

  def transform_positional_slots(klass)
    klass.instance_method(:initialize).parameters
      .count { |kind, _| %i[req opt].include?(kind) }
  end

  def constructor_family(klass)
    @constructor_families ||= {}
    @constructor_families[klass] ||= measure_constructor_family(klass)
  end

  def measure_constructor_family(klass)
    key = class_key(klass)
    instance = begin
      klass.new
    rescue StandardError, ScriptError => e
      raise Error, <<~MESSAGE
        #{key}.new (zero-argument family probe) raised #{e.class}: #{e.message}.
        Every get_class-reachable class has had a fully-defaulted initialize;
        one that stopped needs its shape measured and a family defined for it.
      MESSAGE
    end

    shape = transform_family_ivars(instance)
    family = TRANSFORM_FAMILY_SHAPES[shape]
    unless family
      raise Error, <<~MESSAGE
        #{key}.new assigns #{shape.inspect}, which matches no known constructor
        family. A new initialize shape is a NEW measurement: extend
        TRANSFORM_FAMILY_SHAPES and teach the port's transform to construct it
        before the registry can carry the class.
      MESSAGE
    end

    verify_constructor_family!(key, klass, family)
    family
  end

  def family_probe_failure!(key, family, detail)
    raise Error, "#{key} matched the zero-argument shape of #{family.inspect} " \
                 "but failed its probe: #{detail}. The shapes no longer pin " \
                 "the behaviour; re-measure the family vocabulary."
  end

  # The zero-argument shape is a fingerprint, not a proof: two classes could
  # leave the same ivars while wiring their parameters differently. So every
  # classification is re-measured with sentinel arguments — parameter wiring,
  # the unary side's Slice-to-text conversion, and the option-carrying
  # constructors' empty-hash behaviour (dropped everywhere except `Underset`).
  def verify_constructor_family!(key, klass, family)
    slots = transform_positional_slots(klass)
    unless TRANSFORM_FAMILY_SLOTS.fetch(family).include?(slots)
      family_probe_failure!(key, family,
                            "#{slots} positional slot(s), expected " \
                            "#{TRANSFORM_FAMILY_SLOTS.fetch(family).join(' or ')}")
    end

    slice = transform_sentinel_slice
    stored = klass.new(slice).get(:@parameter_one)
    if %w[unary unaryAttributes text].include?(family)
      unless stored.instance_of?(::String) && stored == TRANSFORM_SLICE_SENTINEL
        family_probe_failure!(key, family, "a Slice argument was not converted " \
                                           "to its text (stored #{stored.class})")
      end
    else
      unless stored.equal?(slice)
        family_probe_failure!(key, family, "a Slice argument did not survive " \
                                           "as itself (stored #{stored.class})")
      end
    end

    case family
    when "unary"
      one = klass.new("s1")
      family_probe_failure!(key, family, "parameter_one wiring") unless one.get(:@parameter_one) == "s1"
    when "unaryAttributes"
      two = klass.new("s1", { "k" => "v" })
      family_probe_failure!(key, family, "parameter_one wiring") unless two.get(:@parameter_one) == "s1"
      family_probe_failure!(key, family, "attributes wiring") unless two.get(:@attributes) == { "k" => "v" }
    when "text"
      two = klass.new("s1", lang: "s2")
      family_probe_failure!(key, family, "parameter_one wiring") unless two.get(:@parameter_one) == "s1"
      family_probe_failure!(key, family, "lang wiring") unless two.get(:@lang) == "s2"
    when "binary", "binaryAssignedOptions"
      two = klass.new("s1", "s2")
      family_probe_failure!(key, family, "parameter_one wiring") unless two.get(:@parameter_one) == "s1"
      family_probe_failure!(key, family, "parameter_two wiring") unless two.get(:@parameter_two) == "s2"
      verify_family_options!(key, klass, family, ["s1", "s2"]) if slots == 3
    when "ternary"
      three = klass.new("s1", "s2", "s3")
      family_probe_failure!(key, family, "parameter_one wiring") unless three.get(:@parameter_one) == "s1"
      family_probe_failure!(key, family, "parameter_two wiring") unless three.get(:@parameter_two) == "s2"
      family_probe_failure!(key, family, "parameter_three wiring") unless three.get(:@parameter_three) == "s3"
      verify_family_options!(key, klass, family, ["s1", "s2", "s3"]) if slots == 4
    end
  end

  def verify_family_options!(key, klass, family, args)
    full = klass.new(*args, { "k" => "v" })
    family_probe_failure!(key, family, "options wiring") unless full.get(:@options) == { "k" => "v" }

    empty = klass.new(*args, {})
    empty_stored = empty.variables.include?(:@options)
    if family == "binaryAssignedOptions"
      family_probe_failure!(key, family, "an empty options hash was dropped") unless
        empty_stored && empty.get(:@options) == {}
    elsif empty_stored
      family_probe_failure!(key, family, "an empty options hash was stored")
    end
  end

  # One measured entry: the name, the class it resolves to, and how the census
  # disposes of that class — the carrier is the implemented class the port
  # constructs (the alias target for an aliased class, itself otherwise).
  # `family: true` adds the measured constructor family (get_class entries
  # only: the font-style table constructs every keyword through the one
  # FontStyle carrier, and its subclasses' initializers — required first
  # argument, non-nil defaults — sit outside the family vocabulary).
  def transform_registry_entry(census_index, name, klass, sources, family: false)
    key = class_key(klass)
    entry = census_index[key]
    raise Error, "#{key} (from #{name.inspect}) is not in the census" unless entry

    measured = {
      "name" => name,
      "rubyClass" => key,
      "disposition" => entry["disposition"],
      "carrier" => entry["aliases"] || key,
    }
    if family && entry["disposition"] != "deferred"
      measured["family"] = constructor_family(klass)
    end
    measured["sources"] = sources.uniq.sort
    measured
  end

  def build_transform_registry(gem_dir, census)
    utility = transform_utility!
    sites = transform_call_sites(gem_dir)
    ranges = transform_capture_ranges(gem_dir)

    unknown = sites["captures"].map { |site| site["key"] }.uniq - TRANSFORM_CAPTURE_KEYS
    unless unknown.empty?
      where = sites["captures"].select { |site| unknown.include?(site["key"]) }
        .map { |site| "#{site['file']}:#{site['line']} (#{site['key']})" }
      raise Error, <<~MESSAGE
        get_class fed by capture(s) with no enumerable range: #{where.join(', ')}.
        Measure the new tag's token range in `transform_capture_ranges` before
        the registry can claim to be complete.
      MESSAGE
    end

    sources_by_name = Hash.new { |hash, key| hash[key] = [] }
    sites["captures"].each do |site|
      ranges.fetch(site["key"]).each { |name| sources_by_name[name] << site["key"] }
    end
    sites["literals"].each { |site| sources_by_name[site["name"]] << "literal" }
    utility::UNARY_CLASSES.each { |name| sources_by_name[name] << "utility_unary_classes" }

    census_index = census.fetch("classes").to_h { |entry| [entry["name"], entry] }
    entries = []
    excluded = []
    sources_by_name.sort.each do |name, sources|
      entry = transform_registry_entry(
        census_index, name, resolve_transform_class(utility, name), sources,
        family: true
      )
      if entry["disposition"] == "deferred"
        excluded << { "name" => name, "rubyClass" => entry["rubyClass"],
                      "reason" => "resolves to a class the census defers " \
                                  "(ARCHITECTURE.md §5); the registry must not carry it" }
      else
        entries << entry
      end
    end

    # The port's registry throws at import on an entry without a family, so an
    # emission that lost one must fail here, where the oracle is on hand.
    unfamilied = entries.reject { |entry| TRANSFORM_FAMILIES.include?(entry["family"]) }
    unless unfamilied.empty?
      raise Error, "get_class entries without a measured constructor family: " \
                   "#{unfamilied.map { |entry| entry['name'] }.join(', ')}"
    end

    missing_fonts = ranges.fetch("fonts").reject { |name| utility::FONT_STYLES.key?(name.to_sym) }
    unless missing_fonts.empty?
      raise Error, "fonts literal(s) #{missing_fonts.join(', ')} have no " \
                   "FONT_STYLES entry; the transform would raise NoMethodError on nil"
    end

    font_styles = utility::FONT_STYLES.map do |font_key, klass|
      transform_registry_entry(census_index, font_key.to_s, klass, ["font_styles"])
    end.sort_by { |entry| entry["name"] }

    {
      "entries" => entries,
      "excluded" => excluded,
      "font_styles" => font_styles,
      # Membership order is not semantic (the transform only calls
      # `include?`); the gem's own order is kept so a regeneration diff
      # mirrors an upstream edit one-to-one.
      "unary_classes" => utility::UNARY_CLASSES.dup,
      "counts" => {
        "get_class" => entries.length,
        "excluded" => excluded.length,
        "font_styles" => font_styles.length,
        "unary_classes" => utility::UNARY_CLASSES.length,
        "literal_sites" => sites["literals"].length,
        "capture_sites" => sites["captures"].length,
      },
    }
  end

  # --- asciimath render tables ---------------------------------------------

  # The three gem tables `to_asciimath` reads that the parse tables cannot
  # supply: the FontStyle wrapper keywords, the table close-paren fallback,
  # and the parentheless simple-table names. Each entry is measured off the
  # runtime — a live render per entry, never a source read
  # (PORTING-STANDARDS.md). The parse direction is no substitute for the
  # first table: `bb`, `mathbf` and `textbf` all parse to `Bold`, and only
  # rendering says which keyword comes back out.

  RENDER_FONT_SENTINEL = "zzfontzz"
  RENDER_TABLE_CELL = "x"

  def render_probe_symbol(value)
    Plurimath::Math::Symbols::Symbol.new(value)
  end

  def render_probe_row
    Plurimath::Math::Function::Tr.new(
      [Plurimath::Math::Function::Td.new([render_probe_symbol(RENDER_TABLE_CELL)])],
    )
  end

  def render_probe_table(open_paren = nil)
    Plurimath::Math::Function::Table.new([render_probe_row], open_paren)
  end

  # FontStyle subclass basename -> the keyword its `to_asciimath` override
  # wraps its value in, measured by rendering a live instance of every
  # subclass and reading the wrapper back. A subclass either wraps —
  # `keyword(value)` with a sentinel, `keyword()` with nil — or renders the
  # value alone (nil in, Ruby-nil out, like the bare carrier); a third
  # render shape is a new upstream behaviour and stops generation.
  def font_style_render_keywords
    root = Plurimath::Math::Function::FontStyle
    subclasses = all_descendants(root).uniq
    raise Error, "FontStyle has no subclasses; the model did not load" if subclasses.empty?

    keywords = {}
    subclasses.sort_by(&:name).each do |klass|
      basename = class_key(klass).split("::").last
      wrapped = klass.new(render_probe_symbol(RENDER_FONT_SENTINEL))
        .to_asciimath(options: {})
      bare = klass.new(nil).to_asciimath(options: {})

      if wrapped == RENDER_FONT_SENTINEL
        unless bare.nil?
          raise Error, "#{basename} renders its value alone but returned " \
                       "#{bare.inspect} for a nil value, not Ruby nil; the " \
                       "value-alone contract no longer holds"
        end
        next
      end

      match = wrapped.match(/\A(\w+)\(#{Regexp.escape(RENDER_FONT_SENTINEL)}\)\z/)
      unless match && bare == "#{match[1]}()"
        raise Error, <<~MESSAGE
          #{class_key(klass)} rendered #{wrapped.inspect} (nil: #{bare.inspect}),
          neither the value alone nor a keyword wrapper. A third render shape
          is a NEW measurement; widen this probe before emitting the table.
        MESSAGE
      end

      keywords[basename] = match[1]
    end

    if keywords.empty?
      raise Error, "no FontStyle subclass wraps its value; an empty keyword " \
                   "table is a failure, not a finding"
    end

    carrier = root.new(render_probe_symbol(RENDER_FONT_SENTINEL), "bold")
      .to_asciimath(options: {})
    unless carrier == RENDER_FONT_SENTINEL && root.new(nil, "bold").to_asciimath(options: {}).nil?
      raise Error, "the bare FontStyle carrier no longer renders its value " \
                   "alone; the renderer's fallback arm is measured against that"
    end

    keywords
  end

  # `Asciimath::Constants::TABLE_PARENTHESIS`, as the RENDER path reads it:
  # `Table#to_asciimath` looks the fallback close paren up by the rendered
  # open paren when `close_paren` is nil (`math/function/table.rb:43-49`).
  # The pairs reuse the grammar reader — same constant, same shape checks —
  # and every mapping is then verified by a render that actually falls back
  # through it, plus one unlisted open paren proving a miss interpolates
  # the empty string.
  def table_close_fallback_pairs
    pairs = grammar_paren_pairs("TABLE_PARENTHESIS",
                                Plurimath::Asciimath::Constants::TABLE_PARENTHESIS)

    pairs.each do |open, close|
      rendered = render_probe_table(render_probe_symbol(open)).to_asciimath(options: {})
      expected = "#{open}[#{RENDER_TABLE_CELL}]#{close}"
      next if rendered == expected

      raise Error, "a table with open paren #{open.inspect} and a nil close " \
                   "rendered #{rendered.inspect}, not #{expected.inspect}; the " \
                   "render path no longer falls back through TABLE_PARENTHESIS"
    end

    miss_open = "{"
    if pairs.any? { |open, _close| open == miss_open }
      raise Error, "the miss probe's open paren #{miss_open.inspect} is now " \
                   "listed; probe the miss branch with another"
    end
    missed = render_probe_table(render_probe_symbol(miss_open)).to_asciimath(options: {})
    unless missed == "#{miss_open}[#{RENDER_TABLE_CELL}]"
      raise Error, "an unlisted open paren rendered #{missed.inspect}; a miss " \
                   "no longer interpolates the empty string, which the port's " \
                   "renderer mirrors"
    end

    pairs
  end

  # `Table::SIMPLE_TABLES` — the lowercased class basenames whose tables
  # render parentheless, `{:...:}`, whatever their parens
  # (`math/function/table.rb:20,41`). Each name is verified to name exactly
  # one Table subclass through the `class_name` the gem's own guard reads,
  # and to actually take the parentheless path in a render; the base table's
  # bracketed render proves that check can tell the two paths apart.
  def simple_table_names
    table_root = Plurimath::Math::Function::Table
    names = table_root::SIMPLE_TABLES
    raise Error, "SIMPLE_TABLES is #{names.class}; expected an Array" unless names.is_a?(::Array)
    raise Error, "SIMPLE_TABLES is empty; the emitted list would prove nothing" if names.empty?

    duplicates = names.tally.select { |_, count| count > 1 }.keys
    raise Error, "SIMPLE_TABLES repeats #{duplicates.join(', ')}" unless duplicates.empty?

    descendants = all_descendants(table_root).uniq
    names.each do |name|
      matches = descendants.select { |klass| klass.new([]).class_name == name }
      unless matches.length == 1
        raise Error, "SIMPLE_TABLES name #{name.inspect} matches #{matches.length} " \
                     "Table subclasses (#{matches.map { |k| class_key(k) }.join(', ')}); " \
                     "expected exactly one"
      end

      rendered = matches.first.new([render_probe_row]).to_asciimath(options: {})
      next if rendered == "{:[#{RENDER_TABLE_CELL}]:}"

      raise Error, "#{class_key(matches.first)} rendered #{rendered.inspect}, not " \
                   "the parentheless {:...:}; SIMPLE_TABLES no longer routes it"
    end

    base = render_probe_table.to_asciimath(options: {})
    unless base == "[[#{RENDER_TABLE_CELL}]]"
      raise Error, "the base table rendered #{base.inspect}; the parentheless " \
                   "check above can no longer discriminate"
    end

    names.dup
  end

  def build_render_tables
    {
      "font_keywords" => font_style_render_keywords,
      "table_close" => table_close_fallback_pairs,
      "simple_tables" => simple_table_names,
    }
  end

  # --- mathml render tables ------------------------------------------------

  # The gem tables `to_mathml_without_math_tag` reads that neither the parse
  # tables nor the symbol descriptors supply. Same discipline as the
  # asciimath set: every entry is measured off the runtime and re-verified by
  # a render (or the gem's own reader method) that actually uses it.

  MATHML_SPACING_PREFIX = "<mrow>\n      <mo rspace=\"thickmathspace\"/>"

  def mathml_probe_formula(node)
    Plurimath::Math::Formula.new([node])
  end

  # `Utility::UNARY_CLASSES` as `UnaryFunction#to_mathml_without_math_tag`
  # reads it (unary_function.rb:31): a member class_name renders `<mi>` inside
  # the spacing wrap, a non-member (`Hom`, `Arg`, ...) an `<mo>` with no wrap.
  # Every carrier-default class is verified through a live render against the
  # arm its membership selects, so both arms stay measured.
  def mathml_unary_mi_names
    names = Plurimath::Utility::UNARY_CLASSES
    raise Error, "UNARY_CLASSES is #{names.class}; expected an Array" unless names.is_a?(::Array)
    raise Error, "UNARY_CLASSES is empty" if names.empty?

    duplicates = names.tally.select { |_, count| count > 1 }.keys
    raise Error, "UNARY_CLASSES repeats #{duplicates.join(', ')}" unless duplicates.empty?

    carrier = Plurimath::Math::Function::UnaryFunction
    defaults = all_descendants(carrier).uniq.select do |klass|
      klass.instance_method(:to_mathml_without_math_tag).owner == carrier
    end
    raise Error, "no unary class renders through the carrier default" if defaults.empty?

    mo_arm_seen = false
    defaults.sort_by(&:name).each do |klass|
      name = klass.new(nil).class_name
      rendered = mathml_probe_formula(klass.new(render_probe_symbol(RENDER_TABLE_CELL))).to_mathml
      if names.include?(name)
        next if rendered.include?(MATHML_SPACING_PREFIX) && rendered.include?("<mi>#{name}</mi>")

        raise Error, "#{class_key(klass)} rendered #{rendered.inspect} — not the " \
                     "spacing-wrapped <mi> shape UNARY_CLASSES membership promises"
      else
        mo_arm_seen = true
        next if rendered.include?("<mo>#{name}</mo>") && !rendered.include?(MATHML_SPACING_PREFIX)

        raise Error, "#{class_key(klass)} rendered #{rendered.inspect} — not the " \
                     "bare <mo> shape a non-member takes"
      end
    end
    unless mo_arm_seen
      raise Error, "every carrier-default unary class is now in UNARY_CLASSES; " \
                   "the <mo> arm went unverified — probe it another way"
    end

    names.dup
  end

  # `Mathml::Constants::UNICODE_SYMBOLS.invert`, name -> entity, in Ruby's
  # invert order (last write wins — asserted collision-free so the order is
  # not load-bearing). Read twice by the render path: `Text#symbol_value`
  # (text.rb:126-128) looks `unicode[:name]` tokens up through it, reached from
  # `Text#parse_text` at :137, and
  # `Core#invert_unicode_symbols` keys it by class_name for the big-operator
  # `<mo>` texts (core.rb:230). Word-shaped names are verified through a live
  # `Text` render; the operator reads through `Int`/`Oint`/`Sum`/`Prod`.
  def mathml_unicode_invert
    raw = Plurimath::Mathml::Constants::UNICODE_SYMBOLS
    # Several names ("o+", "hat", "bar", "ul", "&", ...) are mapped from more
    # than one entity; Ruby's Hash#invert keeps the LAST entity for each, and
    # the verification loop below checks the emitted winner against a live
    # render for every word-shaped name — the duplicated reachable ones
    # included — so last-wins is measured, not assumed.
    inverted = raw.invert.to_h { |name, entity| [name.to_s, entity.to_s] }

    inverted.each do |name, entity|
      next unless name.match?(/\A\w+\z/)

      rendered = mathml_probe_formula(
        Plurimath::Math::Function::Text.new("unicode[:#{name}]"),
      ).to_mathml
      next if rendered.include?("<mtext>#{entity}</mtext>")

      raise Error, "Text unicode[:#{name}] rendered #{rendered.inspect}, " \
                   "not <mtext>#{entity}</mtext>; the invert table drifted"
    end

    {
      "int" => Plurimath::Math::Function::Int,
      "oint" => Plurimath::Math::Function::Oint,
      "sum" => Plurimath::Math::Function::Sum,
      "prod" => Plurimath::Math::Function::Prod,
    }.each do |name, klass|
      entity = inverted.fetch(name) do
        raise Error, "UNICODE_SYMBOLS no longer maps #{name.inspect}; " \
                     "invert_unicode_symbols would fall back to the class name"
      end
      rendered = mathml_probe_formula(klass.new).to_mathml
      next if rendered.include?("<mo>#{entity}</mo>")

      raise Error, "#{class_key(klass)} rendered #{rendered.inspect}, not " \
                   "<mo>#{entity}</mo>; invert_unicode_symbols drifted"
    end

    inverted
  end

  # `Mathml::Constants::SYMBOLS.invert`, the second lookup in
  # `Text#symbol_value` (text.rb:128). Only word-shaped names are reachable
  # through the `unicode[:\w+]` token regex; `tilde` is the one such name
  # today, verified live. The rest ride along for table fidelity.
  def mathml_symbols_invert
    inverted = Plurimath::Mathml::Constants::SYMBOLS.invert
      .to_h { |name, text| [name.to_s, text.to_s] }

    unicode_names = Plurimath::Mathml::Constants::UNICODE_SYMBOLS.values.map(&:to_s)
    inverted.each do |name, text|
      next unless name.match?(/\A\w+\z/)
      # A name UNICODE_SYMBOLS also carries never reaches this fallback.
      next if unicode_names.include?(name)

      rendered = mathml_probe_formula(
        Plurimath::Math::Function::Text.new("unicode[:#{name}]"),
      ).to_mathml
      next if rendered.include?("<mtext>#{text}</mtext>")

      raise Error, "Text unicode[:#{name}] rendered #{rendered.inspect}, not " \
                   "<mtext>#{text}</mtext>; the SYMBOLS fallback drifted"
    end

    inverted
  end

  def mathml_mathvariant_of(node)
    element = node.to_mathml_without_math_tag(false, options: {})
    unless element.respond_to?(:name) && element.name == "mstyle"
      raise Error, "font-style render produced #{element.inspect}, not an <mstyle>"
    end

    variant = element.attributes["mathvariant"]
    raise Error, "font-style <mstyle> carries no mathvariant" if variant.nil?

    variant.to_s
  end

  # FontStyle subclass basename -> the `mathvariant` its mathml render emits,
  # measured per class: the eight overriding subclasses hardcode theirs
  # (font_style/bold.rb:21-30, ...), the six others resolve through
  # `font_family(mathml: true)` -> `SUPPORTED_FONT_STYLES` (font_style.rb:
  # 216-240). One measurement covers both routes.
  def mathml_font_style_variants
    root = Plurimath::Math::Function::FontStyle
    subclasses = all_descendants(root).uniq
    raise Error, "FontStyle has no subclasses; the model did not load" if subclasses.empty?

    subclasses.sort_by(&:name).to_h do |klass|
      basename = class_key(klass).split("::").last
      variant = mathml_mathvariant_of(klass.new(render_probe_symbol(RENDER_TABLE_CELL)))
      [basename, variant]
    end
  end

  # The bare FontStyle carrier resolves `parameter_two` through
  # `Utility::FONT_STYLES` -> `SUPPORTED_FONT_STYLES` (font_style.rb:276-286):
  # each FONT_STYLES keyword measured end-to-end, an unknown keyword passing
  # through verbatim (verified), and a nil `parameter_two` crashing in the gem
  # (`nil.to_sym`, verified) — the port raises RenderError there.
  def mathml_font_style_carrier_variants
    root = Plurimath::Math::Function::FontStyle
    keys = Plurimath::Utility::FONT_STYLES.keys.map(&:to_s)
    raise Error, "FONT_STYLES is empty" if keys.empty?

    table = keys.to_h do |key|
      [key, mathml_mathvariant_of(root.new(render_probe_symbol(RENDER_TABLE_CELL), key))]
    end

    unless mathml_mathvariant_of(root.new(render_probe_symbol(RENDER_TABLE_CELL),
                                          RENDER_FONT_SENTINEL)) == RENDER_FONT_SENTINEL
      raise Error, "an unknown font keyword no longer passes through as the " \
                   "mathvariant; the port's miss arm is measured against that"
    end

    begin
      root.new(render_probe_symbol(RENDER_TABLE_CELL), nil)
        .to_mathml_without_math_tag(false, options: {})
      raise Error, "a bare FontStyle with nil parameter_two now renders; the " \
                   "port raises RenderError there and must be re-measured"
    rescue NoMethodError
      # `parameter_to_class` calls `parameter_two.to_sym` — the measured crash.
    end

    table
  end

  # `Base::MUNDER_CLASSES` (function/base.rb:15-21): the first-slot class_names whose
  # script renders `<munder>` instead of `<msub>`. Each verified by a live
  # `Base` render, plus one non-member proving the check discriminates.
  def mathml_munder_class_names
    names = Plurimath::Math::Function::Base::MUNDER_CLASSES
    raise Error, "MUNDER_CLASSES is #{names.class}" unless names.is_a?(::Array)
    raise Error, "MUNDER_CLASSES is empty" if names.empty?

    by_class_name = mathml_first_slot_instances
    names.each do |name|
      node = by_class_name[name]
      raise Error, "MUNDER_CLASSES name #{name.inspect} matches no measured class" unless node

      rendered = mathml_probe_formula(
        Plurimath::Math::Function::Base.new(node, render_probe_symbol("y")),
      ).to_mathml
      next if rendered.include?("<munder>")

      raise Error, "Base with a #{name} first slot rendered #{rendered.inspect}, " \
                   "not <munder>; MUNDER_CLASSES no longer routes it"
    end

    plain = mathml_probe_formula(
      Plurimath::Math::Function::Base.new(render_probe_symbol(RENDER_TABLE_CELL),
                                          render_probe_symbol("y")),
    ).to_mathml
    unless plain.include?("<msub>")
      raise Error, "a plain Base rendered #{plain.inspect}; the munder check " \
                   "above can no longer discriminate"
    end

    names.dup
  end

  # One live instance per MUNDER_CLASSES name, built through the classes the
  # gem's `class_name` reads back.
  def mathml_first_slot_instances
    function = Plurimath::Math::Function
    {
      "ubrace" => function::Ubrace.new(render_probe_symbol(RENDER_TABLE_CELL)),
      "obrace" => function::Obrace.new(render_probe_symbol(RENDER_TABLE_CELL)),
      "right" => function::Right.new("("),
      "max" => function::Max.new(render_probe_symbol(RENDER_TABLE_CELL)),
      "min" => function::Min.new(render_probe_symbol(RENDER_TABLE_CELL)),
    }
  end

  # Symbol ids whose `tag_name` answers "underover" (symbols/sum.rb:39-41 and
  # friends), which `PowerBase#to_mathml_without_math_tag` turns into
  # `<munderover>` (power_base.rb:14). Measured over every symbol class and
  # verified through a live PowerBase render per id, plus one "subsup" id.
  def mathml_underover_tag_ids
    ids = symbol_classes.filter_map do |klass|
      instance = begin
        klass.new
      rescue ::StandardError
        next
      end
      tag = instance.tag_name
      next if tag == "subsup"

      unless tag == "underover"
        raise Error, "#{symbol_id(klass)} answers tag_name #{tag.inspect}; only " \
                     "subsup and underover are modelled — measure the new tag"
      end

      symbol_id(klass)
    end
    raise Error, "no symbol answers tag_name underover; the table would prove nothing" if ids.empty?

    ids.each do |id|
      klass = Object.const_get("Plurimath::Math::Symbols::#{id}")
      rendered = mathml_probe_formula(
        Plurimath::Math::Function::PowerBase.new(klass.new, render_probe_symbol("y"),
                                                 render_probe_symbol("z")),
      ).to_mathml
      next if rendered.include?("<munderover>")

      raise Error, "PowerBase over #{id} rendered #{rendered.inspect}, not " \
                   "<munderover>; tag_name no longer routes it"
    end

    subsup = mathml_probe_formula(
      Plurimath::Math::Function::PowerBase.new(render_probe_symbol(RENDER_TABLE_CELL),
                                               render_probe_symbol("y"),
                                               render_probe_symbol("z")),
    ).to_mathml
    unless subsup.include?("<msubsup>")
      raise Error, "a plain PowerBase rendered #{subsup.inspect}; the underover " \
                   "check above can no longer discriminate"
    end

    ids
  end

  # The mtable paren pipeline, measured through the gem's own readers on a
  # live Table: per Paren id, whether `mathml_paren_present?` counts it
  # (table.rb:430-435) and the `<mo>` text `mathml_parenthesis` produces
  # (table.rb:202-213) — nil where that reader raises (both `encoded` and
  # `paren_value` missing or private), which the port maps to RenderError.
  def mathml_table_paren_entries
    table = render_probe_table
    parens = all_descendants(Plurimath::Math::Symbols::Paren).uniq.sort_by(&:name)
    raise Error, "no Paren classes loaded" if parens.empty?

    entries = parens.to_h do |klass|
      instance = klass.new
      present = table.send(:mathml_paren_present?, instance, false, options: {})
      text = begin
        table.send(:mathml_parenthesis, instance, false, options: {})
      rescue NoMethodError
        nil
      end
      [symbol_id(klass), { "present" => present == true, "text" => text }]
    end

    sample = entries.fetch("Paren::Lsquare")
    unless sample["present"] && sample["text"] == "["
      raise Error, "Paren::Lsquare measured #{sample.inspect}; the paren pipeline drifted"
    end
    crash = entries.fetch("Paren::Lbbrack")
    unless crash["text"].nil?
      raise Error, "Paren::Lbbrack now answers mathml_parenthesis " \
                   "(#{crash.inspect}); the crash arm is no longer a crash"
    end

    rendered = mathml_probe_formula(
      Plurimath::Math::Function::Table.new([render_probe_row],
                                           Plurimath::Math::Symbols::Paren::Lsquare.new,
                                           Plurimath::Math::Symbols::Paren::Rsquare.new),
    ).to_mathml
    unless rendered.include?("<mo>[</mo>") && rendered.include?("<mo>]</mo>")
      raise Error, "a square-fenced table rendered #{rendered.inspect}; the " \
                   "measured paren texts do not reach real output"
    end

    entries
  end

  # Class-identity roles the mtable/mtr/mtd path tests with `is_a?`:
  # `Paren::CloseParen` forces `columnalign="left"` (table.rb:249),
  # `Paren::Norm` routes `norm_table` (table.rb:61), `Paren::Vert` marks a
  # column line and empties its cell (lib/plurimath/utility.rb:207, td.rb:19), and
  # `Symbols::Hline` is stripped from a row head (tr.rb:120-124). Membership
  # is measured over the loaded hierarchy — descendants included, so a new
  # subclass lands here on regeneration — and each role is verified live.
  def mathml_paren_role_ids
    symbols = Plurimath::Math::Symbols
    role = lambda do |root|
      ([root] + all_descendants(root)).uniq.sort_by(&:name).map { |klass| symbol_id(klass) }
    end
    roles = {
      "close" => role.call(symbols::Paren::CloseParen),
      "norm" => role.call(symbols::Paren::Norm),
      "vert" => role.call(symbols::Paren::Vert),
      "hline" => role.call(symbols::Hline),
    }

    aligned = mathml_probe_formula(
      Plurimath::Math::Function::Table.new([render_probe_row], nil,
                                           symbols::Paren::CloseParen.new),
    ).to_mathml
    raise Error, "a CloseParen close no longer sets columnalign" unless aligned.include?('columnalign="left"')

    normed = mathml_probe_formula(
      Plurimath::Math::Function::Table.new([render_probe_row], symbols::Paren::Norm.new),
    ).to_mathml
    raise Error, "a Norm open no longer routes norm_table" unless normed.include?("<mo>&#x2016;</mo>")

    vert_cell = mathml_probe_formula(
      Plurimath::Math::Function::Table.new(
        [Plurimath::Math::Function::Tr.new(
          [Plurimath::Math::Function::Td.new([symbols::Paren::Vert.new])],
        )],
      ),
    ).to_mathml
    unless vert_cell.include?('columnlines="solid"') && vert_cell.include?("<mtr></mtr>")
      raise Error, "a Vert-only cell rendered #{vert_cell.inspect}; the vert role drifted"
    end

    hlined = mathml_probe_formula(
      Plurimath::Math::Function::Table.new(
        [Plurimath::Math::Function::Tr.new(
          [Plurimath::Math::Function::Td.new([symbols::Hline.new,
                                              render_probe_symbol(RENDER_TABLE_CELL)])],
        )],
      ),
    ).to_mathml
    if hlined.include?("hline") || !hlined.include?("<mi>#{RENDER_TABLE_CELL}</mi>")
      raise Error, "a leading Hline is no longer stripped: #{hlined.inspect}"
    end

    roles
  end

  # The AsciiMath-reachable class basenames per abstract carrier, re-emitted
  # into the mathml slice: the mathml kind files guard the same measured set
  # the asciimath ones do, and §3's generated-data closure forbids them
  # reading the asciimath slice's registry. Derived from the same
  # `get_class` census, so the two copies cannot drift apart.
  def mathml_reachable_carrier_names(registry)
    carriers = {
      "unary" => "Math::Function::UnaryFunction",
      "binary" => "Math::Function::BinaryFunction",
    }
    lists = carriers.transform_values do |carrier|
      registry["entries"]
        .select { |entry| entry["carrier"] == carrier }
        .map { |entry| entry["rubyClass"].split("::").last }
        .uniq
    end
    lists.each do |group, names|
      raise Error, "no reachable #{group} carrier names; the guard set would be empty" if names.empty?
    end
    lists
  end

  # Every Table subclass basename -> the mathml override family its render
  # goes through, measured off `instance_method(:to_mathml_without_math_tag)`
  # ownership: `matrix`/`array`/`bmatrix` have their own bodies
  # (table/matrix.rb:26, table/array.rb:19, table/bmatrix.rb), and the
  # intent-only wrappers (`vmatrix.rb`, `pmatrix.rb`, `eqarray.rb`,
  # `cases.rb` — `super` plus intent attributes this port never reaches,
  # intent being deferred) collapse onto `base` with a render-verified
  # equivalence at intent: false.
  def mathml_table_name_families
    table_root = Plurimath::Math::Function::Table
    own_bodies = {
      "Matrix" => "matrix",
      "Array" => "array",
      "Bmatrix" => "bmatrix",
    }
    intent_only = %w[Vmatrix Pmatrix Eqarray Cases]

    all_descendants(table_root).uniq.sort_by(&:name).to_h do |klass|
      basename = class_key(klass).split("::").last
      owner = klass.instance_method(:to_mathml_without_math_tag).owner
      family =
        if own_bodies.key?(basename)
          unless owner == klass
            raise Error, "#{basename} no longer owns its mathml body (owner #{owner})"
          end
          own_bodies[basename]
        elsif owner == table_root
          "base"
        elsif intent_only.include?(basename)
          base_like = table_root.new([render_probe_row], klass.new([]).open_paren,
                                     klass.new([]).close_paren)
          own = mathml_probe_formula(klass.new([render_probe_row])).to_mathml
          base = mathml_probe_formula(base_like).to_mathml
          unless own == base
            raise Error, "#{basename} diverges from the base table at intent: false " \
                         "(#{own.inspect} vs #{base.inspect}); its family is no longer base"
          end
          "base"
        else
          raise Error, "#{basename} renders through unmeasured owner #{owner}; " \
                       "classify it before emitting the family table"
        end
      [basename, family]
    end
  end

  # `Color#mathml_options` builds its `mathcolor`/`mathbackground` attribute
  # from `parameter_one.to_asciimath` (color.rb:79-88) — the one place the
  # gem's mathml path calls the asciimath renderer. The port's format slices
  # are independent (§3), so the symbol literals that lookup can reach are
  # re-emitted into the mathml slice from the same measurement that feeds
  # `asciimath/symbols.ts`; the two copies cannot drift. Verified end to end
  # by a live Color render over an id symbol.
  def mathml_color_symbol_literals
    baseline = { "intent" => false, "table" => false, "rspace" => nil }
    literals = static_symbol_classes(symbol_classes).map do |klass|
      [symbol_id(klass), representation(klass, "asciimath", baseline)]
    end

    eqno = literals.assoc("Eqno")
    raise Error, "Eqno lost its asciimath literal" unless eqno

    rendered = mathml_probe_formula(
      Plurimath::Math::Function::Color.new(
        Plurimath::Math::Formula.new([Plurimath::Math::Symbols::Eqno.new]),
        render_probe_symbol(RENDER_TABLE_CELL),
      ),
    ).to_mathml
    expected = "mathcolor=\"#{eqno[1].delete('"')}\""
    unless rendered.include?(expected)
      raise Error, "Color over Eqno rendered #{rendered.inspect}, not #{expected}; " \
                   "the color literal path drifted"
    end

    literals
  end

  def build_mathml_render_tables(registry)
    {
      "color_literals" => mathml_color_symbol_literals,
      "unary_mi" => mathml_unary_mi_names,
      "unicode_invert" => mathml_unicode_invert,
      "symbols_invert" => mathml_symbols_invert,
      "font_variants" => mathml_font_style_variants,
      "font_carrier" => mathml_font_style_carrier_variants,
      "munder" => mathml_munder_class_names,
      "underover_ids" => mathml_underover_tag_ids,
      "table_parens" => mathml_table_paren_entries,
      "paren_roles" => mathml_paren_role_ids,
      "carrier_names" => mathml_reachable_carrier_names(registry),
      "table_families" => mathml_table_name_families,
    }
  end

  # --- latex render tables -------------------------------------------------

  # The six measured tables `to_latex` reads that no other generated slice
  # supplies, consumed by `src/formats/latex/renderer.ts`. Every entry is
  # measured off the runtime — a live render per row, never a source read
  # (PORTING-STANDARDS.md) — because the sources lie where probes cannot:
  # `Hash#invert` keeps the LAST key for a duplicated value,
  # `validate_function_formula` is not `Utility::UNARY_CLASSES` (ker, liminf,
  # limsup and sup sit in that parse-side list yet take the wrap), and the
  # parse tables collapse `bb`, `mathbf` and `textbf` into one class.

  LATEX_RENDER_CELL = "x"
  LATEX_RENDER_FONT_SENTINEL = "zzfontzz"

  def latex_render_probe_symbol(value)
    Plurimath::Math::Symbols::Symbol.new(value)
  end

  def latex_render_probe_row
    Plurimath::Math::Function::Tr.new(
      [Plurimath::Math::Function::Td.new([latex_render_probe_symbol(LATEX_RENDER_CELL)])],
    )
  end

  # `Latex::Constants::LEFT_RIGHT_PARENTHESIS.invert`, exactly as
  # `UnaryFunction#latex_paren` reads it (`unary_function.rb:246`): the stored
  # paren string -> the command `Left`/`Right` emit, `.` on a miss. Ruby's
  # `Hash#invert` keeps the LAST key for a duplicated value, so the duplicates
  # are asserted rather than assumed; every surviving row is then verified
  # through both a `Left` and a `Right` render, plus a miss and a nil proving
  # the dot fallback the port's renderer mirrors.
  def latex_left_right_parens
    constant = Plurimath::Latex::Constants::LEFT_RIGHT_PARENTHESIS
    unless constant.is_a?(::Hash)
      raise Error, "LEFT_RIGHT_PARENTHESIS is #{constant.class}; expected a Hash"
    end
    raise Error, "LEFT_RIGHT_PARENTHESIS is empty; every Left/Right would render \".\"" if constant.empty?

    constant.each do |command, stored|
      next if command.is_a?(::Symbol) && stored.is_a?(::String)

      raise Error, "LEFT_RIGHT_PARENTHESIS pair #{command.inspect} => " \
                   "#{stored.inspect} is not Symbol => String"
    end

    inverted = constant.invert
    constant.group_by { |_command, stored| stored }
      .select { |_stored, pairs| pairs.length > 1 }
      .each do |stored, pairs|
        next if inverted[stored] == pairs.last.first

        raise Error, "Hash#invert no longer keeps the last key for #{stored.inspect}; " \
                     "the emitted row would not match what latex_paren returns"
      end

    pairs = inverted.map { |stored, command| [stored, command.to_s] }
    pairs.each do |stored, command|
      left = Plurimath::Math::Function::Left.new(stored).to_latex(options: {})
      right = Plurimath::Math::Function::Right.new(stored).to_latex(options: {})
      next if left == "\\left #{command}" && right == "\\right #{command}"

      raise Error, "Left/Right holding #{stored.inspect} rendered #{left.inspect} / " \
                   "#{right.inspect}, not the inverted constant's #{command.inspect}"
    end

    miss = "zzmisszz"
    raise Error, "the miss probe #{miss.inspect} is now listed; probe with another" if inverted.key?(miss)

    [miss, nil].each do |stored|
      rendered = Plurimath::Math::Function::Left.new(stored).to_latex(options: {})
      next if rendered == "\\left ."

      raise Error, "Left holding #{stored.inspect} rendered #{rendered.inspect}; a miss " \
                   "no longer falls back to \".\", which the port's renderer mirrors"
    end

    pairs
  end

  # The unary names the renderer must NOT wrap in `{ \left ( … \right ) }`:
  # the reachable `UnaryFunction` classes whose `validate_function_formula`
  # answers false, measured per live instance and verified through an
  # `Overset` render (`latex_wrapped`, binary_function.rb:159). The set is
  # NOT `Utility::UNARY_CLASSES` — ker, liminf, limsup and sup sit in that
  # parse-side list yet take the wrap. `Left` and `Right` also answer false
  # but carry their own renderer dispatch, so they are asserted here and
  # omitted from the emitted list.
  def latex_plain_wrapped_unary_names(registry)
    classes = registry.fetch("entries")
      .select { |entry| entry["carrier"] == "Math::Function::UnaryFunction" }
      .map { |entry| Object.const_get("Plurimath::#{entry['rubyClass']}") }
      .uniq
    if classes.empty?
      raise Error, "no registry entry carries Math::Function::UnaryFunction; " \
                   "the measured domain is gone"
    end

    # `Tr` is constructed by the transform without `get_class`, so the
    # renderer lists it as reachable; it is measured with the rest.
    classes << Plurimath::Math::Function::Tr

    plain = []
    wrapping = []
    classes.sort_by(&:name).each do |klass|
      basename = class_key(klass).split("::").last
      instance = if klass == Plurimath::Math::Function::Tr
                   latex_render_probe_row
                 else
                   klass.new(latex_render_probe_symbol(LATEX_RENDER_CELL))
                 end
      answer = instance.validate_function_formula
      inner = instance.to_latex(options: {})
      rendered = Plurimath::Math::Function::Overset.new(instance, nil).to_latex(options: {})
      expected = answer ? "{ \\left ( #{inner} \\right ) }" : "{#{inner}}"
      unless rendered == "\\overset#{expected}"
        raise Error, "#{class_key(klass)} answers validate_function_formula " \
                     "#{answer} but an Overset render produced #{rendered.inspect}; " \
                     "latex_wrapped no longer reads the answer this table records"
      end
      (answer ? wrapping : plain) << basename
    end

    if wrapping.empty?
      raise Error, "every reachable unary class answers false; a table holding " \
                   "the whole domain distinguishes nothing"
    end
    raise Error, "no reachable unary class answers false; the plain set is gone" if plain.empty?

    %w[Left Right].each do |name|
      next if plain.delete(name)

      raise Error, "#{name} no longer answers validate_function_formula false; " \
                   "the renderer's dedicated #{name} dispatch hard-codes that answer"
    end

    plain.sort
  end

  # The class basenames the AsciiMath transform reaches through one carrier:
  # the `get_class` census rows whose census disposition aliases them onto it
  # — the same rows the asciimath transform-registry slice carries, projected
  # for the latex renderer's carrier dispatch and emitted latex-side so the
  # latex module graph never imports another format's data slice
  # (ARCHITECTURE.md §3, the generated-data closure). Membership only — the
  # renderer asks `has` — so the list is deduplicated and sorted. The classes
  # the transform constructs directly without `get_class` (`Tr`, `Power`,
  # `Mod`, `Td`) sit outside the census rows and stay renderer-side.
  def latex_carrier_basenames(registry, carrier)
    names = registry.fetch("entries")
      .select { |entry| entry["carrier"] == carrier }
      .map { |entry| entry["rubyClass"].split("::").last }
      .uniq.sort
    if names.empty?
      raise Error, "no registry entry carries #{carrier}; the measured domain is gone"
    end

    names
  end

  # FontStyle subclass basename -> the `\math..` command its `to_latex`
  # override wraps its value in, measured by rendering a live instance of
  # every subclass and reading the wrapper back. A subclass either wraps —
  # `\command{value}` with a sentinel, `\command{}` with nil — or renders the
  # value alone (nil in, Ruby-nil out, like the bare carrier); a third render
  # shape is a new upstream behaviour and stops generation.
  def latex_font_style_commands
    root = Plurimath::Math::Function::FontStyle
    subclasses = all_descendants(root).uniq
    raise Error, "FontStyle has no subclasses; the model did not load" if subclasses.empty?

    commands = {}
    subclasses.sort_by(&:name).each do |klass|
      basename = class_key(klass).split("::").last
      wrapped = klass.new(latex_render_probe_symbol(LATEX_RENDER_FONT_SENTINEL))
        .to_latex(options: {})
      bare = klass.new(nil).to_latex(options: {})

      if wrapped == LATEX_RENDER_FONT_SENTINEL
        unless bare.nil?
          raise Error, "#{basename} renders its value alone but returned " \
                       "#{bare.inspect} for a nil value, not Ruby nil; the " \
                       "value-alone contract no longer holds"
        end
        next
      end

      match = wrapped.match(
        /\A(\\[A-Za-z]+)\{#{Regexp.escape(LATEX_RENDER_FONT_SENTINEL)}\}\z/,
      )
      unless match && bare == "#{match[1]}{}"
        raise Error, <<~MESSAGE
          #{class_key(klass)} rendered #{wrapped.inspect} (nil: #{bare.inspect}),
          neither the value alone nor a backslash-command wrapper. A third render
          shape is a NEW measurement; widen this probe before emitting the table.
        MESSAGE
      end

      commands[basename] = match[1]
    end

    if commands.empty?
      raise Error, "no FontStyle subclass wraps its value; an empty command " \
                   "table is a failure, not a finding"
    end

    carrier = root.new(latex_render_probe_symbol(LATEX_RENDER_FONT_SENTINEL), "bold")
      .to_latex(options: {})
    unless carrier == LATEX_RENDER_FONT_SENTINEL &&
           root.new(nil, "bold").to_latex(options: {}).nil?
      raise Error, "the bare FontStyle carrier no longer renders its value " \
                   "alone; the renderer's fallback arm is measured against that"
    end

    commands
  end

  # Symbol id -> the environment a named table's open paren selects
  # (`matrix_class`, table.rb:257: `MATRICES.invert[open_paren.to_matrices]`),
  # measured through a `Table::Matrix` render per defining paren. Exactly the
  # parens defining `to_matrices` are emitted; a paren without it raises
  # NoMethodError in the gem (verified below) — RenderError in the port.
  def latex_matrix_environments
    parens = all_descendants(Plurimath::Math::Symbols::Paren).uniq.sort_by(&:name)
    raise Error, "Paren has no subclasses; the model did not load" if parens.empty?

    defining = parens.select { |klass| klass.new.respond_to?(:to_matrices) }
    if defining.empty?
      raise Error, "no Paren subclass defines to_matrices; every named table " \
                   "with an open paren would crash"
    end

    environments = {}
    defining.each do |klass|
      rendered = Plurimath::Math::Function::Table::Matrix
        .new([latex_render_probe_row], klass.new).to_latex(options: {})
      match = rendered.match(
        /\A\\begin\{(\w+)\}#{Regexp.escape(LATEX_RENDER_CELL)}\\end\{\1\}\z/,
      )
      unless match
        raise Error, "a Matrix with open paren #{class_key(klass)} rendered " \
                     "#{rendered.inspect}, not a \\begin{env}…\\end{env} pair; " \
                     "the environment cannot be read off the render"
      end
      environments[symbol_id(klass)] = match[1]
    end

    missing = (parens - defining).first
    if missing.nil?
      raise Error, "every paren defines to_matrices; the miss probe needs a " \
                   "non-defining one"
    end

    begin
      rendered = Plurimath::Math::Function::Table::Matrix
        .new([latex_render_probe_row], missing.new).to_latex(options: {})
      raise Error, "a Matrix with open paren #{class_key(missing)} rendered " \
                   "#{rendered.inspect} instead of raising NoMethodError; the " \
                   "port's RenderError there no longer mirrors the gem"
    rescue NoMethodError
      # The measured crash: the port raises RenderError where the gem raises
      # NoMethodError (ARCHITECTURE.md §5).
    end

    environments
  end

  # `Utility::ALIGNMENT_LETTERS.invert`, exactly as `array_args` (array.rb:33)
  # and `latex_columnalign` (table.rb:270) read it: a td's `columnalign` ->
  # its column letter. Every row is verified through a `Table::Array` render,
  # plus one unlisted alignment proving a miss contributes nothing (the
  # whole-row `.` fallback the port's renderer mirrors).
  def latex_alignment_letters
    constant = Plurimath::Utility::ALIGNMENT_LETTERS
    unless constant.is_a?(::Hash)
      raise Error, "ALIGNMENT_LETTERS is #{constant.class}; expected a Hash"
    end
    raise Error, "ALIGNMENT_LETTERS is empty; every descriptor would fall back to \".\"" if constant.empty?

    constant.each do |letter, alignment|
      next if letter.is_a?(::Symbol) && alignment.is_a?(::String)

      raise Error, "ALIGNMENT_LETTERS pair #{letter.inspect} => " \
                   "#{alignment.inspect} is not Symbol => String"
    end

    inverted = constant.invert
    unless inverted.length == constant.length
      raise Error, "ALIGNMENT_LETTERS duplicates a value; Hash#invert dropped a row"
    end

    pairs = inverted.map { |alignment, letter| [alignment, letter.to_s] }
    pairs.each do |alignment, letter|
      td = Plurimath::Math::Function::Td.new(
        [latex_render_probe_symbol(LATEX_RENDER_CELL)], { columnalign: alignment }
      )
      rendered = Plurimath::Math::Function::Table::Array
        .new([Plurimath::Math::Function::Tr.new([td])]).to_latex(options: {})
      next if rendered == "\\begin{array}{#{letter}}#{LATEX_RENDER_CELL}\\end{array}"

      raise Error, "an array table with columnalign #{alignment.inspect} rendered " \
                   "#{rendered.inspect}; the descriptor no longer reads this table"
    end

    miss = "top"
    raise Error, "the miss probe #{miss.inspect} is now listed; probe with another" if inverted.key?(miss)

    miss_td = Plurimath::Math::Function::Td.new(
      [latex_render_probe_symbol(LATEX_RENDER_CELL)], { columnalign: miss }
    )
    rendered = Plurimath::Math::Function::Table::Array
      .new([Plurimath::Math::Function::Tr.new([miss_td])]).to_latex(options: {})
    unless rendered == "\\begin{array}.#{LATEX_RENDER_CELL}\\end{array}"
      raise Error, "an unlisted columnalign rendered #{rendered.inspect}; a miss no " \
                   "longer falls back to the \".\" descriptor the port's renderer mirrors"
    end

    pairs
  end

  # The ids the corpus and sweep put in a `Color` first slot — a policy list,
  # deliberately minimal (TODO.plan/deferred.md, "Color renders only the
  # measured AsciiMath fragment"): the renderer refuses any other id loudly
  # rather than importing the asciimath format (ARCHITECTURE.md §3).
  LATEX_COLOR_SLICE_IDS = %w[Plus Eqno].freeze

  # Symbol id -> the `to_asciimath` value `Color#to_latex` interpolates for
  # its first slot (color.rb:41), measured per id and verified through a full
  # Color render — the `/\s/` strip included.
  def latex_color_asciimath_symbols
    LATEX_COLOR_SLICE_IDS.map do |id|
      klass = Object.const_get("Plurimath::#{SYMBOL_NAMESPACE}#{id}")
      value = symbol_instance(klass).to_asciimath(options: {})
      unless value.is_a?(::String) && !value.empty?
        raise Error, "#{id}#to_asciimath returned #{value.inspect}; the color " \
                     "slice expects a non-empty string"
      end

      rendered = Plurimath::Math::Function::Color.new(
        symbol_instance(klass), latex_render_probe_symbol(LATEX_RENDER_CELL)
      ).to_latex(options: {})
      expected = "{\\color{#{value.gsub(/\s/, '')}} #{LATEX_RENDER_CELL}}"
      unless rendered == expected
        raise Error, "Color holding #{id} rendered #{rendered.inspect}, not " \
                     "#{expected.inspect}; to_latex no longer routes the first " \
                     "slot through to_asciimath"
      end

      [id, value]
    end
  end

  def build_latex_render_tables(registry)
    {
      "left_right_parens" => latex_left_right_parens,
      "plain_wrapped_unary" => latex_plain_wrapped_unary_names(registry),
      "font_style_commands" => latex_font_style_commands,
      "matrix_environments" => latex_matrix_environments,
      "alignment_letters" => latex_alignment_letters,
      "color_asciimath" => latex_color_asciimath_symbols,
      "unary_carrier_names" =>
        latex_carrier_basenames(registry, "Math::Function::UnaryFunction"),
      "binary_carrier_names" =>
        latex_carrier_basenames(registry, "Math::Function::BinaryFunction"),
    }
  end

  # --- TypeScript emission -------------------------------------------------

  # Biome's string rule: the configured quote wins unless the other one needs
  # fewer escapes.
  def ts_string(value)
    unless value.is_a?(::String)
      raise Error, "cannot emit #{value.class} as a TypeScript string"
    end
    if value.match?(/[\u0000-\u001f\u007f]/)
      raise Error, "control character in #{value.inspect}; the emitter would have to escape it"
    end

    quote = value.count('"') > value.count("'") ? "'" : '"'
    escaped = value.gsub("\\") { "\\\\" }.gsub(quote) { "\\#{quote}" }
    "#{quote}#{escaped}#{quote}"
  end

  def ts_key(key)
    key.to_s.match?(/\A[A-Za-z_$][A-Za-z0-9_$]*\z/) ? key.to_s : ts_string(key.to_s)
  end

  def ts_flat(value)
    case value
    when nil then "null"
    when true, false, ::Integer then value.to_s
    when ::String then ts_string(value)
    when ::Symbol then ts_string(value.to_s)
    when ::Array then "[#{value.map { |item| ts_flat(item) }.join(', ')}]"
    when ::Hash
      return "{}" if value.empty?

      "{ #{value.map { |key, item| "#{ts_key(key)}: #{ts_flat(item)}" }.join(', ')} }"
    else raise Error, "cannot emit #{value.class} as TypeScript"
    end
  end

  # Biome keeps an object expanded when the source has a newline after `{`, and
  # keeps an array expanded when it has more than one composite element — but it
  # *collapses* any other array that fits. So the emitter has to make the same
  # fits/breaks decision Biome would, and `assert_ts_width!` catches a miss.
  def ts_value(value, indent, column = indent * 2)
    flat = ts_flat(value)
    # `+ 1` leaves room for the `,` or `;` Biome prints after the value.
    fits = column + flat.length + 1 <= TS_PRINT_WIDTH
    return flat if fits && !ts_force_break?(value)

    pad = "  " * indent
    case value
    when ::Array
      return "[]" if value.empty?

      lines = value.map { |item| "#{pad}  #{ts_value(item, indent + 1)}," }
      (["["] + lines + ["#{pad}]"]).join("\n")
    when ::Hash
      return "{}" if value.empty?

      lines = value.map do |key, item|
        prefix = "#{pad}  #{ts_key(key)}: "
        "#{prefix}#{ts_value(item, indent + 1, prefix.length)},"
      end
      (["{"] + lines + ["#{pad}}"]).join("\n")
    else flat
    end
  end

  def ts_force_break?(value)
    return false unless value.is_a?(::Array) && value.length > 1

    value.all? do |item|
      (item.is_a?(::Hash) && item.length > 1) || (item.is_a?(::Array) && item.length > 1)
    end
  end

  def ts_doc(text)
    ["/**", *text.split("\n").map { |line| line.empty? ? " *" : " * #{line}" }, " */"].join("\n")
  end

  def ts_const(name, type, value, doc: nil)
    prefix = "export const #{name}: #{type} = "
    [doc && ts_doc(doc), "#{prefix}#{ts_value(value, 0, prefix.length)};"].compact.join("\n")
  end

  # One line per entry, which is what Biome prints for an array of tuples that
  # each fit. `assert_ts_width!` is what keeps "that each fit" true.
  def ts_tuple_map(name, type, entries, doc: nil)
    lines = entries.map do |key, value|
      "  [#{ts_string(key)}, #{ts_flat(value)}],"
    end
    [doc && ts_doc(doc), "export const #{name}: #{type} = new Map([", *lines, "]);"]
      .compact.join("\n")
  end

  def ts_tuple_list(name, type, entries, doc: nil)
    lines = entries.map { |entry| "  #{ts_flat(entry)}," }
    [doc && ts_doc(doc), "export const #{name}: #{type} = [", *lines, "];"].compact.join("\n")
  end

  def ts_header(description, provenance: true)
    pointer = provenance ? "\nWhat it was generated from is in `#{SYMBOL_OUT_REL}/provenance.ts`." : ""
    ts_doc(<<~TEXT.chomp)
      GENERATED FILE — do not edit, regenerate.

      Emitted by #{GENERATOR_PATH} from the Plurimath Ruby gem, the oracle
      (ARCHITECTURE.md §1).#{pointer}

      #{description}
    TEXT
  end

  def assert_ts_width!(path, body)
    long = body.lines.each_with_index.filter_map do |line, index|
      [index + 1, line.chomp] if line.chomp.length > TS_PRINT_WIDTH
    end
    return if long.empty?

    raise Error, <<~MESSAGE
      #{path} has #{long.length} line(s) over #{TS_PRINT_WIDTH} columns
      (first: line #{long.first.first}, #{long.first.last.length} columns):
        #{long.first.last.strip}
      Biome reflows past #{TS_PRINT_WIDTH}, which would make `pnpm lint` fail on
      generated output. Emit the value expanded instead.
    MESSAGE
  end

  def write_ts(path, sections)
    body = "#{sections.join("\n\n")}\n"
    assert_ts_width!(path, body)
    FileUtils.mkdir_p(File.dirname(path))
    File.binwrite(path, body)
    body
  end

  # --- unicodemath render tables -------------------------------------------

  # The constant tables `to_unicodemath` reads that no other generated slice
  # supplies, consumed by `src/formats/unicodemath/renderer.ts`.
  #
  # Unlike the latex and mathml slices these are read from
  # `Plurimath::UnicodeMath::Constants` rather than measured through a render,
  # and that difference is deliberate rather than lazy: each one is a plain
  # lookup the renderer performs verbatim (`ACCENT_SYMBOLS.include?`,
  # `UNICODE_FRACTIONS.key`, `SIZE_OVERRIDES_SYMBOLS.invert`), with no
  # per-class override anywhere to make a source read lie. What the sources
  # *could* still hide is a shape change, so every table is shape-checked here
  # and a mismatch fails generation.
  #
  # `.invert` and `.key` appear at three call sites (`function/base.rb:128`,
  # `frac.rb:159`, `table.rb:422`), which is the same `Hash#invert`-keeps-the-
  # last-key trap `latex_left_right_parens` asserts against, so the duplicate
  # check below is not theoretical.

  # constant name => output key. Only the tables whose values are plain
  # strings or string lists; the shapes were measured, not assumed.
  UNICODEMATH_TABLES = {
    "UNARY_SYMBOLS" => "unary_symbols",
    "HORIZONTAL_BRACKETS" => "horizontal_brackets",
    "ACCENT_SYMBOLS" => "accent_symbols",
    "UNARY_ARG_FUNCTIONS" => "unary_arg_functions",
    "SIZE_OVERRIDES_SYMBOLS" => "size_overrides",
    "MATRIXS" => "matrixs",
    "SUB_ALPHABETS" => "sub_alphabets",
    "SUP_ALPHABETS" => "sup_alphabets",
    "SUB_DIGITS" => "sub_digits",
    "SUP_DIGITS" => "sup_digits",
    "SUB_OPERATORS" => "sub_operators",
    "SUP_OPERATORS" => "sup_operators",
  }.freeze

  UNICODEMATH_LISTS = {
    "UNDEF_UNARY_FUNCTIONS" => "undef_unary_functions",
    "FONTS_CLASSES" => "fonts_classes",
    "DIACRITIC_OVERLAYS" => "diacritic_overlays",
    "DIACRITIC_BELOWS" => "diacritic_belows",
  }.freeze

  def unicodemath_constant(name)
    unless Plurimath::UnicodeMath::Constants.const_defined?(name)
      raise Error, "UnicodeMath::Constants::#{name} is gone; the renderer reads it"
    end

    value = Plurimath::UnicodeMath::Constants.const_get(name)
    raise Error, "UnicodeMath::Constants::#{name} is empty" if value.empty?

    value
  end

  # Every `UnicodeMath::Constants` table the gem reverse-looks-up on the
  # `to_unicodemath` path, with the call site and — crucially — WHICH Ruby
  # reverse read it uses. Found by grepping the pinned oracle for `.invert`
  # and `.key(` and keeping the render-path hits (the `transform.rb` and
  # `unicode_math/utility.rb` hits are the PARSER, which this port's renderer
  # does not go through; `menclose.rb:115` reverse-reads
  # `Utility::UNICODEMATH_MENCLOSE_FUNCTIONS`, which is not a
  # `UnicodeMath::Constants` table and is not emitted here).
  #
  # The two reads DISAGREE on a duplicated value, measured at the oracle:
  #
  #   {a: 1, b: 1}.key(1)    -> :a      # FIRST match
  #   {a: 1, b: 1}.invert[1] -> :b      # LAST match
  #
  # so a table's direction is not interchangeable with its neighbour's. One
  # site is `invert` (LAST); the other four are `key` (FIRST). The live proof
  # that this is not academic is `PARENTHESIS_MATRICES`, which really does
  # carry three keys on one value: `key(nil)` is `:eqarray` and `invert[nil]`
  # is `:cases` (both measured), and `table.rb:422` is the `key` form, so
  # `:eqarray` is the answer the port must ship.
  #
  # Anywhere NOT on this list, duplicates are ordinary and are emitted as-is:
  # `UNARY_SYMBOLS` legitimately maps both `underline` and `underbar` to the
  # same glyph, and is only ever read forward.
  UNICODEMATH_REVERSED_TABLES = {
    # table                    => [call site,                   read used]
    "SIZE_OVERRIDES_SYMBOLS" => ["function/base.rb:128", :invert],
    "UNICODE_FRACTIONS" => ["frac.rb:159", :key],
    "PARENTHESIS_MATRICES" => ["table.rb:422", :key],
    "PHANTOM_SYMBOLS" => ["phantom.rb:59 and mpadded.rb:102", :key],
  }.freeze

  # How a duplicated value would be resolved by the read the call site uses,
  # phrased for an error message. Not a choice this generator gets to make —
  # it refuses instead — but naming the wrong one would teach the next reader
  # the wrong rule.
  def unicodemath_reverse_read_note(name)
    site, read = UNICODEMATH_REVERSED_TABLES.fetch(name)
    keeps = read == :invert ? "the LAST" : "the FIRST"
    "the gem reverse looks this table up at #{site} with `Hash##{read}`, " \
      "which keeps #{keeps} matching key"
  end

  # A hash the renderer reads as string -> string. Keys are stringified because
  # several of these are keyed by Symbol in the gem and by string in the port.
  #
  # For a reverse-read table the VALUES are stringified too, and that is a
  # second, port-side way to lose an answer: `:a` and `"a"` are distinct values
  # to the gem's reverse read and the same key in the emitted map. So the check
  # here is on the stringified value — it is guarding the emitted map, not the
  # gem's table. The gem-side check on the raw values is
  # `assert_reverse_lookup_safe!`, and both run over every name in
  # `UNICODEMATH_REVERSED_TABLES`.
  def unicodemath_string_map(name)
    constant = unicodemath_constant(name)
    unless constant.is_a?(::Hash)
      raise Error, "UnicodeMath::Constants::#{name} is #{constant.class}; expected a Hash"
    end

    seen = {}
    constant.to_h do |key, value|
      unless value.is_a?(::String) || value.is_a?(::Symbol)
        raise Error, "UnicodeMath::Constants::#{name}[#{key.inspect}] is " \
                     "#{value.class}; expected a String or Symbol"
      end

      text = value.to_s
      if UNICODEMATH_REVERSED_TABLES.key?(name)
        if (earlier = seen[text])
          raise Error, "UnicodeMath::Constants::#{name} maps both #{earlier.inspect} " \
                       "and #{key.inspect} to #{text.inspect} once stringified, and " \
                       "#{unicodemath_reverse_read_note(name)}; the emitted map can " \
                       "hold only one of them, so the port cannot know which one wins"
        end
        seen[text] = key
      end
      [key.to_s, text]
    end
  end

  def unicodemath_string_list(name)
    constant = unicodemath_constant(name)
    unless constant.is_a?(::Array)
      raise Error, "UnicodeMath::Constants::#{name} is #{constant.class}; expected an Array"
    end

    values = constant.map(&:to_s)
    if values.uniq.length != values.length
      raise Error, "UnicodeMath::Constants::#{name} has duplicate entries"
    end

    values
  end

  # A table the gem reverse-looks-up must not map two keys to one value: one of
  # them wins the lookup and the port, which emits the map value-first, cannot
  # represent the loser. WHICH one wins differs by call site — `Hash#key` keeps
  # the FIRST match, `Hash#invert` the LAST (see `UNICODEMATH_REVERSED_TABLES`
  # for the measurement and for which table is read which way) — so this guard
  # refuses rather than picking a side.
  #
  # Nil values are exempt, and NOT because nothing looks them up: `table.rb:422`
  # reverse-reads `PARENTHESIS_MATRICES` with whatever the open paren rendered,
  # and a paren that renders nil lands on the three nil rows. They are exempt
  # because the gem itself ships that collision, so refusing it would refuse
  # correct data. The answer is measured off the gem instead, with the gem's own
  # `Hash#key` — `unicodemath_nil_paren_matrix`, emitted as
  # `UNICODEMATH_NIL_PAREN_MATRIX`.
  def assert_reverse_lookup_safe!(name)
    constant = unicodemath_constant(name)
    return unless constant.is_a?(::Hash)

    # Compared with `==` AND with `eql?`, never with `value.inspect`, and never
    # by using the value as a Hash key.
    #
    # Those three relations are genuinely different here, and the call sites
    # span two of them. `Hash#key` compares with `==` (MRI's `key_i` calls
    # `rb_equal`); `Hash#invert` builds a Hash and so compares with
    # `eql?`/`hash`. Measured at the pinned oracle:
    #
    #   {a: 0}.key(0.0)              -> :a    # `==`: 0 and 0.0 are one value
    #   {a: 0}.invert[0.0]           -> nil   # `eql?`: they are two
    #   seen = {}; seen[0] = :a; seen[0.0] -> nil   # so is a Hash-key guard
    #
    #   a = {mpadded: {depth: "0", height: "0"}, phantom: true}
    #   b = {phantom: true, mpadded: {height: "0", depth: "0"}}
    #   a == b -> true   a.eql?(b) -> true   a.inspect == b.inspect -> false
    #
    # An inspect-keyed guard let two genuinely duplicate `PHANTOM_SYMBOLS`
    # option hashes through; a value-as-Hash-key guard closes that but is still
    # looser than `Hash#key`, which is the read four of the five call sites use.
    # Checking both relations is the only form that is at least as strict as
    # every call site. It is O(n^2), which is free on tables of 4 to 18 rows.
    seen = []
    constant.each do |key, value|
      next if value.nil?

      if (earlier = seen.find { |_, other| other == value || other.eql?(value) })
        raise Error, "UnicodeMath::Constants::#{name} maps both " \
                     "#{earlier.first.inspect} and #{key.inspect} to " \
                     "#{value.inspect}, and #{unicodemath_reverse_read_note(name)}; " \
                     "the port cannot know which key wins"
      end
      seen << [key, value]
    end
  end

  # `UNICODE_FRACTIONS` is keyed by the GLYPH with an `[n, d]` array value, and
  # `Frac#unicodemath_fraction` reads it as `.key([n, d])` — a reverse lookup.
  # Emitted in the direction the renderer reads, `"n/d" => glyph`, so the port
  # performs a forward lookup and never has to reproduce Ruby's `Hash#key`.
  #
  # The reverse-lookup guard covers this table, so a duplicate `[n, d]` pair
  # fails generation rather than silently deciding which glyph wins.
  def unicodemath_fraction_map
    unicodemath_constant("UNICODE_FRACTIONS").to_h do |glyph, pair|
      unless pair.is_a?(::Array) && pair.length == 2 && pair.all?(::Integer)
        raise Error, "UNICODE_FRACTIONS[#{glyph.inspect}] is #{pair.inspect}, " \
                     "not a two-integer pair"
      end

      [pair.join("/"), glyph.to_s]
    end
  end

  # `SUB_PARENTHESIS` / `SUP_PARENTHESIS` nest one level: `{ open: { "(" =>
  # "&#x208d;" }, close: { … } }`. `Symbol#mini_sized_parenthesis`
  # (`symbol.rb:270`) searches every inner hash for the value and digs it out,
  # so the outer grouping never reaches the output — flattening it here
  # computes the same lookup once instead of at every render.
  def unicodemath_nested_paren_map(name)
    flattened = {}
    unicodemath_constant(name).each_value do |inner|
      raise Error, "UnicodeMath::Constants::#{name} inner is #{inner.class}" unless inner.is_a?(::Hash)

      inner.each do |paren, glyph|
        key = paren.to_s
        if flattened.key?(key) && flattened[key] != glyph.to_s
          raise Error, "UnicodeMath::Constants::#{name} maps #{key.inspect} to " \
                       "both #{flattened[key].inspect} and #{glyph.to_s.inspect}; " \
                       "flattening would pick one"
        end
        flattened[key] = glyph.to_s
      end
    end
    flattened
  end

  # `PARENTHESIS_MATRICES` carries three nil values — the gem's own "no
  # delimiter" marker — and they are dropped from the emitted map rather than
  # becoming empty strings, which would collide with a real render.
  #
  # This comment used to say a nil-valued row "can never be the answer",
  # because the lookup goes through a rendered paren string. That was FALSE
  # and measured false: a generic `Symbols::Symbol.new(nil)` renders nil, and
  #
  #   Table(rows, Symbol.new(nil), Paren::Rsquare.new).to_unicodemath
  #     => "&#x2588;(a)"      i.e. MATRIXS[:eqarray]
  #
  # so the nil row is reachable and the port needs its answer. It cannot be
  # derived from the emitted map, so it is emitted separately as
  # `UNICODEMATH_NIL_PAREN_MATRIX`.
  #
  # Which of the three nil keys wins is decided by `Hash#key`, NOT `Hash#invert`
  # (`table.rb:422` — the call really is `.key(...)`). `key` returns the FIRST
  # match where `invert` keeps the LAST, and here they disagree: `key(nil)` is
  # `:eqarray` and `invert[nil]` is `:cases`. Getting that backwards would ship
  # the wrong glyph for every nil-paren table.
  def unicodemath_nullable_map(name)
    unicodemath_constant(name).each_with_object({}) do |(key, value), map|
      next if value.nil?

      map[key.to_s] = value.to_s
    end
  end

  # `PHANTOM_SYMBOLS` values are option hashes, and `Mpadded#mpadded_symbol`
  # reverse-looks-them-up by a WHOLE hash (`PHANTOM_SYMBOLS.key(options)`).
  # Emitted keyed by a canonical serialization of that hash so the port does a
  # string lookup instead of reimplementing Ruby hash equality — key order is
  # normalized because Ruby compares hashes by content, not insertion order.
  def unicodemath_phantom_map
    unicodemath_constant("PHANTOM_SYMBOLS").to_h do |name, options|
      raise Error, "PHANTOM_SYMBOLS[#{name.inspect}] is #{options.class}" unless options.is_a?(::Hash)

      [canonical_option_key(options), name.to_s]
    end
  end

  # The TYPE is part of the key, because Ruby hash equality is what the call
  # site uses and it distinguishes `0` from `"0"`. Serializing both as `0` made
  # `{width: 0}` and `{width: "0"}` collide, and only one of them is really in
  # `PHANTOM_SYMBOLS` — measured, the gem renders `(x)` for the integer form
  # and `&#x21f3;(x)` for the string form. The port's `canonicalKey` mirrors
  # this exactly; the two serializations must stay in step or every phantom
  # lookup silently misses.
  def canonical_option_key(value)
    case value
    when ::Hash
      inner = value.sort_by { |k, _| k.to_s }
                   .map { |k, v| "#{k}:#{canonical_option_key(v)}" }.join(",")
      "{#{inner}}"
    when ::Array then "array:[#{value.map { |v| canonical_option_key(v) }.join(',')}]"
    when ::NilClass then "nil:"
    when ::String then "string:#{value}"
    when ::Integer, ::Float then "number:#{value}"
    when ::TrueClass, ::FalseClass then "boolean:#{value}"
    when ::Symbol then "string:#{value}"
    else value.to_s
    end
  end

  def build_unicodemath_render_tables(registry)
    tables = UNICODEMATH_TABLES.to_h { |name, key| [key, unicodemath_string_map(name)] }
    tables["unicode_fractions"] = unicodemath_fraction_map
    tables["parenthesis_matrices"] = unicodemath_nullable_map("PARENTHESIS_MATRICES")
    tables["phantom_symbols"] = unicodemath_phantom_map
    tables["sub_parenthesis"] = unicodemath_nested_paren_map("SUB_PARENTHESIS")
    tables["sup_parenthesis"] = unicodemath_nested_paren_map("SUP_PARENTHESIS")
    lists = UNICODEMATH_LISTS.to_h { |name, key| [key, unicodemath_string_list(name)] }

    # And the gem-side reverse-lookup guard has to reach them. The check inside
    # `unicodemath_string_map` only sees the tables that pass through it, which
    # of the four reverse-read tables is `SIZE_OVERRIDES_SYMBOLS` alone — the
    # other three have their own builders above, so before this they were
    # existence-checked and nothing more.
    UNICODEMATH_REVERSED_TABLES.each_key { |name| assert_reverse_lookup_safe!(name) }

    # The carrier reachability sets, projected unicodemath-side so this
    # format's carrier dispatch imports no other format's slice. Same census
    # rows the latex projection reads (`latex_carrier_basenames` is generic
    # over the carrier), because reachability is a property of what the
    # AsciiMath transform CONSTRUCTS, not of what any renderer emits.
    tables.merge!(unicodemath_font_tables)
    lists["nil_paren_matrix"] = unicodemath_nil_paren_matrix
    hexcodes = unicodemath_hexcode_tables
    tables["hexcode_in_input"] = hexcodes["hexcode_in_input"]
    lists["symbols_without_hexcode"] = hexcodes["symbols_without_hexcode"]

    lists["unary_carrier_names"] =
      latex_carrier_basenames(registry, "Math::Function::UnaryFunction")
    lists["binary_carrier_names"] =
      latex_carrier_basenames(registry, "Math::Function::BinaryFunction")

    tables.merge(lists)
  end

  # `Utility.hexcode_in_input(field)` per symbol — the RAW entity text the gem
  # compares and emits, which is NOT the rendered glyph.
  #
  # `Core#unicodemath_field_value` is
  # `field.class_name == "symbol" ? field.value : Utility.hexcode_in_input(field)`,
  # and `hexcode_in_input` returns the first `input(:unicodemath)` entry matching
  # `/&#x.+;/`. Nine call sites read `unicodemath_field_value` (`table.rb:411`,
  # `core.rb:420`, `underset.rb:93/129/135`, `overset.rb:64/66/115/126`), and
  # `symbol_prime?` (`unicode_math/utility.rb:188`) reads `hexcode_in_input`
  # directly, bypassing it. They both COMPARE against entity tables and EMIT the
  # value, so a decoded render is the wrong string on both counts. Measured:
  # `Overset(Acute, Symbol("x"))` gives `"(x)&#x301;"`, not `"(x)́"`.
  #
  # The classes with NO such entry are emitted separately rather than omitted,
  # because "absent" is a behaviour the port has to reproduce rather than a row
  # to skip. Measured on the oracle: `hexcode_in_input` returns nil for 10 of
  # 1,460 classes — `Bar`, `If`, `Ul`, `Paren`, and `Paren::Lcurly/Lround/
  # Lsquare/Rcurly/Rround/Rsquare`.
  #
  # What nil DOES depends on the reader, so do not generalise from one. Measured
  # with `Bar`: only `prime_unicode?` (`core.rb:420`) raises, calling `.include?`
  # on nil; `symbol_prime?` returns nil and BOTH `unicode_accent?` return false,
  # because `match_unicode?` is `Array#include?`/`Hash#value?`, nil-safe by
  # construction. A port that throws at every one of these sites is wrong at
  # eight of the nine.
  def unicodemath_hexcode_tables
    with_hexcode = {}
    without = []
    symbol_classes.each do |klass|
      next if klass.name.nil?

      id = symbol_id(klass)
      value = begin
        instance = klass.new
        Plurimath::Utility.hexcode_in_input(instance)
      rescue StandardError
        nil
      end
      if value.is_a?(::String) && value.match?(/&#x.+;/)
        with_hexcode[id] = value
      else
        without << id
      end
    end
    if with_hexcode.empty?
      raise Error, "no symbol carries a unicodemath hexcode; hexcode_in_input has changed shape"
    end

    { "hexcode_in_input" => with_hexcode.sort.to_h,
      "symbols_without_hexcode" => without.sort }
  end

  # `PARENTHESIS_MATRICES.key(nil)` — the matrix name a nil-rendering open
  # paren resolves to. Read from the gem with Ruby's own `Hash#key`, so the
  # port never has to reproduce first-match-wins itself.
  def unicodemath_nil_paren_matrix
    constant = unicodemath_constant("PARENTHESIS_MATRICES")
    name = constant.key(nil)
    raise Error, "PARENTHESIS_MATRICES no longer carries a nil value" if name.nil?

    name.to_s
  end

  # The two hops `FontStyle#to_unicodemath` makes, as tables the port can read.
  #
  # The gem goes family-alias -> FontStyle subclass (`Utility::FONT_STYLES`) ->
  # font name (`UnicodeMath::Constants::FONTS_CLASSES`), and the second hop is
  # an ordered `find` rather than a lookup: a class's font is the ONE member of
  # `FONTS_CLASSES` that appears among the aliases pointing at that class.
  #
  # That is only a table if the relation is a bijection, so this refuses to
  # emit anything unless it is: every class must meet `FONTS_CLASSES` in
  # exactly one alias, and every font must be claimed. Measured at the pinned
  # oracle it is 14 classes onto 14 fonts with nothing left over — but a table
  # generated from a relation that stopped being one would silently pick a
  # winner, which is the failure the whole generator exists to prevent.
  def unicodemath_font_tables
    styles = Plurimath::Utility::FONT_STYLES
    fonts = unicodemath_constant("FONTS_CLASSES")

    aliases_by_class = Hash.new { |hash, key| hash[key] = [] }
    styles.each do |family, klass|
      aliases_by_class[klass.name.split("::").last] << family.to_s
    end

    font_of_class = aliases_by_class.to_h do |basename, aliases|
      hit = aliases & fonts
      unless hit.size == 1
        raise Error, "FontStyle::#{basename} meets FONTS_CLASSES in #{hit.size} aliases " \
                     "(#{hit.inspect}); the class -> font relation is no longer a function"
      end

      [basename, hit.first]
    end

    unclaimed = fonts.sort - font_of_class.values.sort
    unless unclaimed.empty?
      raise Error, "FONTS_CLASSES entries no FontStyle subclass claims: #{unclaimed.inspect}"
    end

    class_of_family = styles.to_h { |family, klass| [family.to_s, klass.name.split("::").last] }

    {
      "font_of_class" => font_of_class.sort.to_h,
      "class_of_family" => class_of_family.sort.to_h,
    }
  end

  # --- symbol data payloads ------------------------------------------------

  def symbol_representation_type(format)
    format == "mathml" ? "MathmlSymbolDescriptor" : "string"
  end

  def format_constant(format)
    format.upcase
  end

  def emit_symbols_file(out_root, format, classes)
    baseline = { "intent" => false, "table" => false, "rspace" => nil }
    entries = classes.map { |klass| [symbol_id(klass), representation(klass, format, baseline)] }
    sections = [ts_header(<<~TEXT.chomp)]
      Symbol id -> the static #{format} representation of that symbol.

      Symbol ids are the Ruby class keys (`Sigma`, `Paren::Lround`) and are
      schema values: an upstream rename needs an alias entry, never a silent
      change (§7). Context-dependent symbols carry their variants in
      `./exceptions.ts`; a renderer applies those over this descriptor.
    TEXT

    if format == "mathml"
      sections << [
        ts_doc("One MathML element with exactly one text node — a representation,\nnot final output."),
        "export interface MathmlSymbolDescriptor {",
        "  readonly tag: string;",
        "  readonly text: string;",
        "}",
      ].join("\n")
      # The descriptor type has no `attributes` because no symbol carries one
      # off-axis. If that changes, say so instead of dropping them silently.
      attributed = entries.reject { |_id, descriptor| descriptor["attributes"].empty? }
      unless attributed.empty?
        raise Error, <<~MESSAGE
          #{attributed.map(&:first).sort.join(', ')} render mathml attributes with
          every axis at its baseline. Add `attributes` to MathmlSymbolDescriptor
          before emitting them, or they are lost.
        MESSAGE
      end

      entries = entries.map { |id, descriptor| [id, descriptor.slice("tag", "text")] }
    end

    sections << ts_tuple_map(
      "#{format_constant(format)}_SYMBOLS",
      "ReadonlyMap<string, #{symbol_representation_type(format)}>",
      entries,
      doc: "#{entries.length} symbols. An id missing here is a parity gap: the\n" \
           "renderer throws `MissingSymbolDataError` rather than emitting\n" \
           "something plausible.",
    )

    write_ts(File.join(out_root, format, "symbols.ts"), sections)
  end

  def emit_exceptions_file(out_root, format, findings)
    prefix = format.capitalize
    entries = findings.sort.filter_map do |id, per_format|
      finding = per_format[format]
      next unless finding

      variants = finding["variants"].map do |variant|
        payload = { "when" => variant["when"] }
        if format == "mathml"
          payload["tag"] = variant["value"]["tag"]
          payload["text"] = variant["value"]["text"]
          payload["attributes"] = variant["value"]["attributes"]
        else
          payload["value"] = variant["value"]
        end
        payload
      end
      { "id" => id, "axes" => finding["axes"], "variants" => variants }
    end

    assert_boolean_contexts!(format, entries)

    value_fields =
      if format == "mathml"
        "  readonly tag: string;\n  readonly text: string;\n" \
          "  readonly attributes: Readonly<Record<string, string>>;"
      else
        "  readonly value: string;"
      end

    sections = [
      ts_header(<<~TEXT.chomp),
        The #{format} context-axis exception matrix.

        Only the symbols whose #{format} output actually differs on some axis of
        the committed manifest (`../context-axes.ts`) appear here — the set is
        measured by rendering every symbol across every axis, never hand-picked
        (§5). Everything absent renders from `./symbols.ts` unconditionally.
      TEXT
      [
        ts_doc("The axis values a variant applies under; only the axes that\nactually matter are listed."),
        "export interface #{prefix}SymbolVariant {",
        "  readonly when: Readonly<Record<string, boolean>>;",
        value_fields,
        "}",
      ].join("\n"),
      [
        "export interface #{prefix}SymbolException {",
        "  readonly id: string;",
        "  readonly axes: readonly string[];",
        "  readonly variants: readonly #{prefix}SymbolVariant[];",
        "}",
      ].join("\n"),
      ts_const(
        "#{format_constant(format)}_SYMBOL_EXCEPTIONS",
        "readonly #{prefix}SymbolException[]",
        entries,
        doc: entries.empty? ? "No #{format} symbol varies on any manifested axis." : nil,
      ),
    ]

    write_ts(File.join(out_root, format, "exceptions.ts"), sections)
  end

  # The emitted `when` map is typed `Record<string, boolean>` because both axes
  # that currently matter are booleans. A string-valued axis reaching the matrix
  # has to widen that type, so it stops generation instead of type-erroring.
  def assert_boolean_contexts!(format, entries)
    offenders = entries.flat_map do |entry|
      entry["variants"].flat_map do |variant|
        variant["when"].reject { |_, value| [true, false].include?(value) }.keys
      end
    end.uniq.sort
    return if offenders.empty?

    raise Error, <<~MESSAGE
      #{format} exceptions vary on non-boolean axes (#{offenders.join(', ')}).
      Widen #{format.capitalize}SymbolVariant#when before emitting them.
    MESSAGE
  end

  def emit_input_file(out_root, tables)
    kinds = tables["literal_kinds"].map { |kind| ts_string(kind) }.join(" | ")
    sections = [
      ts_header(<<~TEXT.chomp),
        AsciiMath parser input tables.

        Input text -> symbol id, plus the ordered literal list the grammar
        dispatches on. Both are longest-first, matching the gem's precompile
        ordering; equal-length entries are ordered by text, which is inert
        (two equal-length literals cannot both match at one position) and makes
        the output reproducible where the gem's unstable sort does not.
      TEXT
      ts_tuple_map(
        "ASCIIMATH_SYMBOL_INPUT",
        "ReadonlyMap<string, string>",
        tables["input"],
        doc: "Input text -> symbol id: `Utility.symbols_hash(:asciimath)` merged\n" \
             "with `Utility.parens_hash(:asciimath)`, parens last — the table\n" \
             "`Utility.symbols_class` resolves through.",
      ),
      ts_const(
        "ASCIIMATH_PAREN_INPUTS",
        "readonly string[]",
        tables["paren_inputs"],
        doc: "The inputs contributed by the paren table, so the two source\ntables stay separable.",
      ),
      ts_tuple_list(
        "ASCIIMATH_INPUT_COLLISIONS",
        "readonly (readonly [string, string, string])[]",
        tables["collisions"],
        doc: "Inputs both source tables claim, as [input, symbol id, paren id].\n" \
             "The paren id wins in `ASCIIMATH_SYMBOL_INPUT`, as in the gem.",
      ),
      ts_const(
        "ASCIIMATH_SKIP_INPUT_PARENS",
        "readonly string[]",
        tables["skip_input_parens"],
        doc: "Parens the grammar matches structurally, so they are kept out of\nthe literal list.",
      ),
      "export type AsciimathLiteralKind = #{kinds};",
      ts_tuple_map(
        "ASCIIMATH_LITERALS",
        "ReadonlyMap<string, AsciimathLiteralKind>",
        tables["literals"],
        doc: "The ordered literal list, longest first: iteration order is the\n" \
             "grammar's ordered choice, from `Asciimath::Constants.precompile_constants`.",
      ),
    ]

    write_ts(File.join(out_root, INPUT_FORMAT, "input.ts"), sections)
  end

  def emit_grammar_file(out_root, tables)
    sections = [
      ts_header(<<~TEXT.chomp),
        AsciiMath grammar tables: the alternatives `Asciimath::Parse` builds its
        rules from, consumed by `src/formats/asciimath/grammar.ts`.

        Order is behaviour. Parslet's `|` is an ordered choice and
        `power_base_rules` reduces the three class lists into one of them
        (`asciimath/parse.rb:82-84`), so these arrays keep the gem's insertion
        order — they are never sorted, even where today's entries could not
        overlap.
      TEXT
      ts_const(
        "ASCIIMATH_TERNARY_CLASSES",
        "readonly string[]",
        tables.fetch("ternaryClasses"),
        doc: "`ternary_classes`: a function taking a base, a power and an\noptional third value.",
      ),
      ts_const(
        "ASCIIMATH_BINARY_CLASSES",
        "readonly string[]",
        tables.fetch("binaryClasses"),
        doc: "`binary_classes`: a function taking a base value and a power value.",
      ),
      ts_const(
        "ASCIIMATH_SUB_SUP_CLASSES",
        "readonly string[]",
        tables.fetch("subSupClasses"),
        doc: "`sub_sup_classes`: tagged `:binary_class` like the list above, but\n" \
             "tried first and followed by a single `power_base`.",
      ),
      [
        ts_doc("An opening paren and the closing one that matches it. The two are\n" \
               "kept paired because the grammar resolves one from the other at\n" \
               "parse time (`read_text`, `asciimath/parse.rb:181`)."),
        "export type AsciimathParenPair = readonly [open: string, close: string];",
      ].join("\n"),
      ts_tuple_list(
        "ASCIIMATH_TABLE_PARENTHESIS",
        "readonly AsciimathParenPair[]",
        tables.fetch("tableParenthesis"),
        doc: "`open_table` matches the opening parens, `close_table` the closing\n" \
             "ones. `ᑕ ᑐ ℒ ℛ` are the preprocessing substitutions for `(: :) {: :}`.",
      ),
      ts_tuple_list(
        "ASCIIMATH_PARENTHESIS",
        "readonly AsciimathParenPair[]",
        tables.fetch("parenthesis"),
        doc: "`lparen` matches the opening parens and `rparen` the closing ones;\n" \
             "`read_text` reads the closing one back from the captured opening one.",
      ),
    ]

    write_ts(File.join(out_root, INPUT_FORMAT, "grammar.ts"), sections)
  end

  def emit_transform_registry_file(out_root, registry)
    sections = [
      ts_header(<<~TEXT.chomp),
        Every class name the AsciiMath transform can reach, resolved through
        the gem — the completeness oracle for `src/formats/asciimath/registry.ts`
        (TODO.plan p1/05): the registry is complete exactly when it serves every
        entry here, asserted by `test/generated/transform-registry.spec.ts`
        rather than by hand.

        The reachable set is measured, never inferred: every `get_class`
        argument in `asciimath/transform.rb` and `asciimath/utility.rb`
        (a captured identifier is enumerated through its grammar token range),
        plus the two Utility tables the actions read. Resolution goes through
        the gem because it is not mechanical capitalization: `overbrace`,
        `underbrace` and `underline` resolve through constant aliases to
        classes named differently (`Obrace`, `Ubrace`, `Ul`). Each `get_class`
        entry also carries its resolved class's measured constructor family.
      TEXT
      [
        ts_doc("How the census disposes of a resolved class. A deferred class\n" \
               "never reaches this file — it is excluded at generation time."),
        'export type AsciimathTransformDisposition = "implemented" | "aliased";',
      ].join("\n"),
      [
        ts_doc(<<~TEXT.chomp),
          Which Ruby `initialize` shape a resolved class has, measured off the
          runtime: the generator instantiates each class and reads the
          assigned ivars back, fingerprints the zero-argument shape, then
          re-verifies parameter wiring, Slice-to-text conversion and
          empty-options behaviour with sentinel arguments (source reading
          lies: constructors guard, coerce and inherit). The registry
          (`src/formats/asciimath/registry.ts`) documents what each family
          means operationally; the transform dispatches its builders on it.
        TEXT
        "export type AsciimathTransformConstructorFamily =",
        *TRANSFORM_FAMILIES.map do |family|
          "  | #{ts_string(family)}#{family == TRANSFORM_FAMILIES.last ? ';' : ''}"
        end,
      ].join("\n"),
      [
        ts_doc(<<~TEXT.chomp),
          One reachable name: the class the gem resolves it to, and the
          implemented class the port constructs for it. For an aliased class
          the carrier is its census alias target and the class name rides in
          the carrier's identity slot; an implemented class carries itself.
          `family` is the resolved class's measured constructor family —
          present on every `get_class` entry, absent from the font-style
          table, whose fifty keywords all construct through the one FontStyle
          carrier. `sources` names the measurements that reached the entry: a
          grammar capture tag (`unary_class`, `binary_class`,
          `ternary_class`), a `literal` argument, or a Utility table.
        TEXT
        "export interface AsciimathTransformClassEntry {",
        "  readonly name: string;",
        "  readonly rubyClass: string;",
        "  readonly disposition: AsciimathTransformDisposition;",
        "  readonly carrier: string;",
        "  readonly family?: AsciimathTransformConstructorFamily;",
        "  readonly sources: readonly string[];",
        "}",
      ].join("\n"),
      ts_const(
        "ASCIIMATH_TRANSFORM_GET_CLASS",
        "readonly AsciimathTransformClassEntry[]",
        registry["entries"],
        doc: "#{registry['entries'].length} names `Utility.get_class` can receive, sorted by name.\n" \
             "A name missing from the port's registry is a parity gap: the\n" \
             "transform throws rather than constructing something plausible.",
      ),
      ts_const(
        "ASCIIMATH_TRANSFORM_FONT_STYLES",
        "readonly AsciimathTransformClassEntry[]",
        registry["font_styles"],
        doc: "Every `Utility::FONT_STYLES` key, sorted, resolved to its\n" \
             "FontStyle class. The transform indexes the whole table with the\n" \
             "captured `fonts_class` text, so the port serves all of it; the\n" \
             "grammar's reachable keys are the `fonts`-kind literals in\n" \
             "`./input.ts`.",
      ),
      ts_const(
        "ASCIIMATH_TRANSFORM_UNARY_CLASSES",
        "readonly string[]",
        registry["unary_classes"],
        doc: "`Utility::UNARY_CLASSES`, in the gem's order. Membership only —\n" \
             "the transform asks `include?` to decide whether a unary argument\n" \
             "keeps its fence — so the order is not semantic.",
      ),
      [
        ts_doc("A reachable name withheld from the registry, and why."),
        "export interface AsciimathTransformExclusion {",
        "  readonly name: string;",
        "  readonly rubyClass: string;",
        "  readonly reason: string;",
        "}",
      ].join("\n"),
      ts_const(
        "ASCIIMATH_TRANSFORM_EXCLUDED",
        "readonly AsciimathTransformExclusion[]",
        registry["excluded"],
        doc: registry["excluded"].empty? ? "No reachable name resolves to a deferred class." : nil,
      ),
    ]

    write_ts(File.join(out_root, INPUT_FORMAT, "transform-registry.ts"), sections)
  end

  def emit_render_tables_file(out_root, tables)
    sections = [
      ts_header(<<~TEXT.chomp),
        AsciiMath render tables: the three gem tables `to_asciimath` reads
        that the parse tables cannot supply, consumed by the asciimath
        render kind files (`src/render/<kind>/asciimath.ts`).

        Every entry is measured off the runtime — a live render per entry,
        never a source read (PORTING-STANDARDS.md), each re-verified by the
        generator with a render that actually uses it. The parse direction
        is no substitute for the first table: `bb`, `mathbf` and `textbf`
        all parse to `Bold`, and only rendering says which keyword comes
        back out.
      TEXT
      ts_tuple_map(
        "ASCIIMATH_FONT_STYLE_KEYWORDS",
        "ReadonlyMap<string, string>",
        tables["font_keywords"],
        doc: "FontStyle subclass basename -> the keyword its `to_asciimath`\n" \
             "override wraps its value in, measured per class (`Bold.new(x)` ->\n" \
             "`mathbf(x)`), sorted by basename. A subclass absent here was\n" \
             "measured rendering its value alone, exactly like the bare carrier.",
      ),
      ts_tuple_map(
        "ASCIIMATH_TABLE_CLOSE_FALLBACK",
        "ReadonlyMap<string, string>",
        tables["table_close"],
        doc: "`Asciimath::Constants::TABLE_PARENTHESIS`, keyed by the rendered\n" \
             "open paren: the close paren a table with a nil `close_paren`\n" \
             "falls back to (`math/function/table.rb:43-49`), in the gem's\n" \
             "order. A miss interpolates the empty string (verified).",
      ),
      ts_const(
        "ASCIIMATH_SIMPLE_TABLE_NAMES",
        "readonly string[]",
        tables["simple_tables"],
        doc: "`Table::SIMPLE_TABLES` (`math/function/table.rb:20`): the\n" \
             "lowercased class basenames rendered parentheless, `{:...:}`,\n" \
             "whatever their parens, in the gem's order. Membership only — the\n" \
             "render path asks `include?` — so the order is not semantic.",
      ),
    ]

    write_ts(File.join(out_root, INPUT_FORMAT, "render-tables.ts"), sections)
  end

  def emit_mathml_render_tables_file(out_root, tables)
    sections = [
      ts_header(<<~TEXT.chomp),
        MathML render tables: the gem tables `to_mathml_without_math_tag`
        reads that neither the parse tables nor the symbol descriptors
        supply, consumed by the `src/render/<kind>/mathml.ts` files.

        Every entry is measured off the runtime — a live render (or the
        gem's own reader method on a live instance) per entry, never a
        source read (PORTING-STANDARDS.md), each re-verified by the
        generator with a render that actually uses it.
      TEXT
      ts_const(
        "MATHML_UNARY_MI_NAMES",
        "readonly string[]",
        tables["unary_mi"],
        doc: "`Utility::UNARY_CLASSES` (`unary_function.rb:31`), in the gem's\n" \
             "order: the class_names the unary carrier renders as a\n" \
             "spacing-wrapped `<mi>`; a non-member (`Hom`, `Arg`, ...) takes\n" \
             "the bare `<mo>` arm. Membership only — the render path asks\n" \
             "`include?`. Every carrier-default unary class is render-verified\n" \
             "against the arm its membership selects, both arms live.",
      ),
      ts_tuple_map(
        "MATHML_UNICODE_INVERT",
        "ReadonlyMap<string, string>",
        tables["unicode_invert"],
        doc: "`Mathml::Constants::UNICODE_SYMBOLS.invert`, name -> entity,\n" \
             "Ruby's invert semantics kept: a name mapped from several\n" \
             "entities keeps the LAST one, and every word-shaped winner is\n" \
             "verified through a live `Text` render. Read twice on the render\n" \
             "path: the `unicode[:name]` lookup `Text#parse_text` reaches\n" \
             "via `Text#symbol_value`\n" \
             "(`text.rb:126-128`), and — keyed by class_name —\n" \
             "`Core#invert_unicode_symbols` (`core.rb:230`), the big-operator\n" \
             "`<mo>` texts.",
      ),
      ts_tuple_map(
        "MATHML_SYMBOLS_INVERT",
        "ReadonlyMap<string, string>",
        tables["symbols_invert"],
        doc: "`Mathml::Constants::SYMBOLS.invert`, `Text#symbol_value`'s\n" \
             "fallback lookup (`text.rb:128`). Only word-shaped names can\n" \
             "reach it through the `unicode[:\\w+]` token regex.",
      ),
      ts_tuple_map(
        "MATHML_FONT_STYLE_VARIANTS",
        "ReadonlyMap<string, string>",
        tables["font_variants"],
        doc: "FontStyle subclass basename -> the `mathvariant` its mathml\n" \
             "render emits, measured per class: eight subclasses hardcode\n" \
             "theirs (`font_style/bold.rb:21-30`, ...), six resolve through\n" \
             "`font_family(mathml: true)` (`font_style.rb:216-240`).",
      ),
      ts_tuple_map(
        "MATHML_FONT_STYLE_CARRIER_VARIANTS",
        "ReadonlyMap<string, string>",
        tables["font_carrier"],
        doc: "The bare FontStyle carrier's `parameter_two` keyword -> the\n" \
             "`mathvariant` it resolves to through `Utility::FONT_STYLES`\n" \
             "(`font_style.rb:276-286`), one measurement per keyword. An\n" \
             "unlisted keyword passes through verbatim (verified); a nil\n" \
             "`parameter_two` crashes in the gem (`nil.to_sym`, verified) and\n" \
             "raises RenderError in the port.",
      ),
      ts_const(
        "MATHML_MUNDER_CLASS_NAMES",
        "readonly string[]",
        tables["munder"],
        doc: "`Base::MUNDER_CLASSES` (`function/base.rb:15-21`), in the gem's order:\n" \
             "first-slot class_names whose script renders `<munder>` instead\n" \
             "of `<msub>`. Membership only.",
      ),
      ts_const(
        "MATHML_UNDEROVER_TAG_IDS",
        "readonly string[]",
        tables["underover_ids"],
        doc: "Symbol ids whose `tag_name` answers \"underover\"\n" \
             "(`symbols/sum.rb:39-41` and friends), measured over every\n" \
             "symbol class: `PowerBase` renders `<munderover>` over these\n" \
             "(`power_base.rb:14`, one verifying render per id) and\n" \
             "`<msubsup>` over everything else.",
      ),
      [
        ts_doc(
          "One Paren id's answers to the mtable paren pipeline: whether\n" \
          "`mathml_paren_present?` counts it (`table.rb:430-435`), and the\n" \
          "`<mo>` text `mathml_parenthesis` produces (`table.rb:202-213`) —\n" \
          "null where that reader raises NoMethodError in the gem (both\n" \
          "`encoded` and `paren_value` missing or private), which the port\n" \
          "maps to RenderError.",
        ),
        "export interface MathmlTableParen {",
        "  readonly present: boolean;",
        "  readonly text: string | null;",
        "}",
      ].join("\n"),
      ts_tuple_map(
        "MATHML_TABLE_PARENS",
        "ReadonlyMap<string, MathmlTableParen>",
        tables["table_parens"],
        doc: "Every Paren subclass, measured through the gem's own readers\n" \
             "on a live Table.",
      ),
      [
        "export interface MathmlParenRoles {",
        "  readonly close: readonly string[];",
        "  readonly norm: readonly string[];",
        "  readonly vert: readonly string[];",
        "  readonly hline: readonly string[];",
        "}",
      ].join("\n"),
      ts_const(
        "MATHML_PAREN_ROLE_IDS",
        "MathmlParenRoles",
        tables["paren_roles"],
        doc: "Class-identity roles the mtable/mtr/mtd path tests with\n" \
             "`is_a?`: `close` forces `columnalign=\"left\"` (`table.rb:249`),\n" \
             "`norm` routes `norm_table` (`table.rb:61`), `vert` marks a\n" \
             "column line and empties its cell (`lib/plurimath/utility.rb:207`,\n" \
             "`td.rb:19`), `hline` is stripped from a row head\n" \
             "(`tr.rb:120-124`). Each id list is the measured hierarchy —\n" \
             "root plus descendants — and each role is verified live.",
      ),
      [
        "export interface MathmlCarrierNames {",
        "  readonly unary: readonly string[];",
        "  readonly binary: readonly string[];",
        "}",
      ].join("\n"),
      ts_const(
        "MATHML_REACHABLE_CARRIER_NAMES",
        "MathmlCarrierNames",
        tables["carrier_names"],
        doc: "The AsciiMath-reachable class basenames per abstract carrier —\n" \
             "the same measured guard set the asciimath renderer holds,\n" \
             "re-emitted here because §3's generated-data closure keeps each\n" \
             "format on its own slice. Derived from the one `get_class`\n" \
             "census, so the copies cannot drift. The transform-direct\n" \
             "constructions (`Tr`, `Power`, `Mod`, `Td`, `PowerBase`) are\n" \
             "added in the kind files, exactly as the asciimath ones do.",
      ),
      ts_tuple_map(
        "MATHML_COLOR_SYMBOL_LITERALS",
        "ReadonlyMap<string, string>",
        tables["color_literals"],
        doc: "Symbol id -> its asciimath literal, re-emitted into this slice\n" \
             "for the ONE place the gem's mathml path calls the asciimath\n" \
             "renderer: `Color#mathml_options` builds `mathcolor` from\n" \
             "`parameter_one.to_asciimath` (`color.rb:79-88`). Same\n" \
             "measurement as `asciimath/symbols.ts` (baseline axes), so the\n" \
             "copies cannot drift; verified by a live Color render.",
      ),
      ts_tuple_map(
        "MATHML_TABLE_NAME_FAMILIES",
        "ReadonlyMap<string, string>",
        tables["table_families"],
        doc: "Every Table subclass basename -> the mathml override family\n" \
             "its render goes through, measured off method ownership:\n" \
             "`matrix` (`table/matrix.rb:26`), `array` (`table/array.rb:19`),\n" \
             "`bmatrix` (`table/bmatrix.rb`), and `base` for the rest — the\n" \
             "intent-only wrappers (`Vmatrix`, `Pmatrix`, `Eqarray`, `Cases`)\n" \
             "render-verified byte-identical to the base table at\n" \
             "intent: false, the only intent this port reaches (intent is\n" \
             "deferred).",
      ),
    ]

    write_ts(File.join(out_root, "mathml", "render-tables.ts"), sections)
  end

  def emit_unicodemath_render_tables_file(out_root, tables)
    sections = [
      ts_header(<<~TEXT.chomp),
        UnicodeMath render tables: the constant tables `to_unicodemath` reads
        that no other generated slice supplies, consumed by the per-node
        renderers under `src/render/<kind>/unicodemath.ts` that
        `src/formats/unicodemath/renderer.ts` dispatches to.

        Read from `Plurimath::UnicodeMath::Constants` rather than measured
        through a render, unlike the latex and mathml slices. That is a
        deliberate difference: each is a plain lookup the gem performs
        verbatim, with no per-class override to make a source read lie. What a
        source read could still miss is a shape change, so the generator
        shape-checks every table and fails rather than emitting something
        malformed.

        Five call sites reverse-look-up four of these tables, and NOT all with
        the same Ruby read: `function/base.rb:128` is `SIZE_OVERRIDES_SYMBOLS.invert`,
        while `frac.rb:159` (`UNICODE_FRACTIONS`), `table.rb:422`
        (`PARENTHESIS_MATRICES`), `phantom.rb:59` and `mpadded.rb:102` (both
        `PHANTOM_SYMBOLS`) are `Hash#key`. The two disagree on a duplicated
        value — measured, `{a: 1, b: 1}.key(1)` is `:a` and `.invert[1]` is
        `:b`, FIRST match against LAST — so the generator refuses a duplicate
        value in THOSE FOUR tables rather than pick a side.

        That is the whole of the guarantee. Tables nothing reverse-reads are
        emitted with their duplicates intact, because forward reads do not
        care: `UNICODEMATH_UNARY_SYMBOLS` below maps both `underline` and
        `underbar` to `&#x2581;`. And nil values are exempt even in the four,
        because the gem itself ships a collision on them —
        `PARENTHESIS_MATRICES` has three nil rows, `table.rb:422` really can
        land on them, and the winner is measured off the gem with the gem's
        own `Hash#key` and emitted separately as
        `UNICODEMATH_NIL_PAREN_MATRIX` (`eqarray`; `invert` would have said
        `cases`).

        Two entries here are NOT from `Constants` and are not lookups at all:
        `UNICODEMATH_UNARY_CARRIER_NAMES` and
        `UNICODEMATH_BINARY_CARRIER_NAMES` are the class basenames the
        AsciiMath transform reaches through each carrier, read from the
        `get_class` census registry — the same rows the latex projection
        reads, emitted separately so each format's carrier dispatch imports
        only its own slice. Membership only, deduplicated and sorted. The
        renderers add the names the transform constructs WITHOUT `get_class`
        (`Tr` on the unary carrier; `Power`, `Mod` and `Td` on the binary
        one), which no census row can carry.
      TEXT
    ]

    tables.each do |key, data|
      name = "UNICODEMATH_#{key.upcase}"
      sections << case data
                  when ::String then ts_const(name, "string", data)
                  when ::Array then ts_const(name, "readonly string[]", data)
                  else ts_tuple_map(name, "ReadonlyMap<string, string>", data)
                  end
    end

    write_ts(File.join(out_root, "unicodemath", "render-tables.ts"), sections)
  end

  def emit_latex_render_tables_file(out_root, tables)
    sections = [
      ts_header(<<~TEXT.chomp),
        LaTeX render tables: the six measured tables `to_latex` reads that
        no other generated slice supplies, plus the two carrier name lists
        the latex dispatch reads, consumed by
        `src/formats/latex/renderer.ts`.

        Every measured entry is read off the runtime — a live render per
        row, never a source read (PORTING-STANDARDS.md), each re-verified
        by the generator with a render that actually uses it. The sources
        lie where the probes cannot: `Hash#invert` keeps the LAST key for
        a duplicated value, and `validate_function_formula` is not
        `Utility::UNARY_CLASSES` — ker, liminf, limsup and sup sit in that
        parse-side list yet take the `{ \\left ( … \\right ) }` wrap.

        The two carrier name lists are not measured here: they are the
        same `get_class` census rows the asciimath transform-registry
        slice carries, projected to class basenames per carrier and
        emitted latex-side, because per-format slices are self-contained
        by design — the latex module graph never imports another format's
        data (ARCHITECTURE.md §3, the generated-data closure).
      TEXT
      ts_tuple_map(
        "LATEX_LEFT_RIGHT_PARENS",
        "ReadonlyMap<string, string>",
        tables["left_right_parens"],
        doc: "`Latex::Constants::LEFT_RIGHT_PARENTHESIS.invert`, exactly as\n" \
             "`UnaryFunction#latex_paren` reads it: the stored paren string ->\n" \
             "the command `Left`/`Right` emit, in the gem's invert order.\n" \
             "`&#x2016;` maps to `\\|` because Ruby's `Hash#invert` keeps the\n" \
             "LAST key for a duplicated value (asserted at generation); a miss\n" \
             "renders `.` (verified).",
      ),
      ts_const(
        "LATEX_PLAIN_WRAPPED_UNARY_NAMES",
        "readonly string[]",
        tables["plain_wrapped_unary"],
        doc: "The unary names whose class answers `validate_function_formula`\n" \
             "false, so `latex_wrapped` gives them plain braces — measured per\n" \
             "class through an `Overset` render, sorted. NOT\n" \
             "`Utility::UNARY_CLASSES`: ker, liminf, limsup and sup sit there\n" \
             "yet take the wrap. `Left` and `Right` also answer false\n" \
             "(asserted) but carry their own renderer dispatch, so they are\n" \
             "omitted here. Membership only — the renderer asks `has` — so\n" \
             "the order is not semantic.",
      ),
      ts_tuple_map(
        "LATEX_FONT_STYLE_COMMANDS",
        "ReadonlyMap<string, string>",
        tables["font_style_commands"],
        doc: "FontStyle subclass basename -> the `\\math..` command its\n" \
             "`to_latex` override wraps its value in, measured per class\n" \
             "(`Bold.new(x)` -> `\\mathbf{x}`), sorted by basename. A subclass\n" \
             "absent here was measured rendering its value alone, exactly like\n" \
             "the bare carrier (Ruby-nil out on nil in).",
      ),
      ts_tuple_map(
        "LATEX_MATRIX_ENVIRONMENTS",
        "ReadonlyMap<string, string>",
        tables["matrix_environments"],
        doc: "Symbol id -> the environment a named table's open paren selects\n" \
             "(`matrix_class`: `MATRICES.invert[open_paren.to_matrices]`),\n" \
             "measured through a `Table::Matrix` render per paren, sorted by\n" \
             "class name. Exactly the parens defining `to_matrices`; any other\n" \
             "open paren raises NoMethodError in the gem (verified) —\n" \
             "RenderError in the port.",
      ),
      ts_tuple_map(
        "LATEX_ALIGNMENT_LETTERS",
        "ReadonlyMap<string, string>",
        tables["alignment_letters"],
        doc: "`Utility::ALIGNMENT_LETTERS.invert`, as `array_args` and\n" \
             "`latex_columnalign` read it: a td's `columnalign` -> its column\n" \
             "letter, in the gem's invert order. An unlisted alignment\n" \
             "contributes nothing (verified: the whole-row fallback is `.`).",
      ),
      ts_tuple_map(
        "LATEX_COLOR_ASCIIMATH_SYMBOLS",
        "ReadonlyMap<string, string>",
        tables["color_asciimath"],
        doc: "Symbol id -> the `to_asciimath` value `Color#to_latex`\n" \
             "interpolates for its first slot, for exactly the ids the\n" \
             "corpus+sweep put there — a deliberately minimal policy slice\n" \
             "(TODO.plan/deferred.md); the renderer raises a parity-gap\n" \
             "RenderError for any other id.",
      ),
      ts_const(
        "LATEX_UNARY_CARRIER_NAMES",
        "readonly string[]",
        tables["unary_carrier_names"],
        doc: "The class basenames the AsciiMath transform reaches through\n" \
             "the `Math::Function::UnaryFunction` carrier — the same\n" \
             "`get_class` census rows the asciimath transform-registry\n" \
             "slice carries, projected and emitted latex-side so the latex\n" \
             "carrier dispatch imports no other format's slice. The\n" \
             "renderer adds `Tr` itself (constructed without `get_class`).\n" \
             "Membership only — deduplicated and sorted.",
      ),
      ts_const(
        "LATEX_BINARY_CARRIER_NAMES",
        "readonly string[]",
        tables["binary_carrier_names"],
        doc: "The class basenames the AsciiMath transform reaches through\n" \
             "the `Math::Function::BinaryFunction` carrier — the same\n" \
             "`get_class` census rows the asciimath transform-registry\n" \
             "slice carries, projected and emitted latex-side. The renderer\n" \
             "adds `Power`, `Mod` and `Td` itself (constructed without\n" \
             "`get_class`). Membership only — deduplicated and sorted.",
      ),
    ]

    write_ts(File.join(out_root, "latex", "render-tables.ts"), sections)
  end

  def emit_context_axes_file(out_root, probe)
    sections = [
      ts_header(<<~TEXT.chomp),
        The context-axis probe: its manifest, and what it found.

        This module is documentation-as-data for the exception matrices in
        `<format>/exceptions.ts`. No renderer imports it — importing it would
        pull every format's findings into one bundle (§3).
      TEXT
      [
        "export interface ContextAxis {",
        "  readonly name: string;",
        "  readonly values: readonly string[];",
        "  readonly formats: readonly string[];",
        "  readonly mechanism: string;",
        "}",
      ].join("\n"),
      ts_const("CONTEXT_AXES", "readonly ContextAxis[]", probe["axes"],
               doc: "The committed axis manifest. Probing cannot discover an axis it\n" \
                    "does not exercise, so this list is reviewed, not inferred (§5)."),
      [
        "export interface HostTemplate {",
        "  readonly name: string;",
        "  readonly description: string;",
        "}",
      ].join("\n"),
      ts_const("HOST_TEMPLATES", "readonly HostTemplate[]", probe["templates"],
               doc: "The surroundings every symbol is rendered in, so neighbour-dependent\n" \
                    "behaviour is exercised and not only the isolated symbol."),
      [
        "export interface ContextDependentSymbol {",
        "  readonly id: string;",
        "  readonly formats: readonly string[];",
        "  readonly axes: readonly string[];",
        "  readonly probes: readonly string[];",
        "}",
      ].join("\n"),
      ts_const("CONTEXT_DEPENDENT_SYMBOLS", "readonly ContextDependentSymbol[]",
               probe["context_dependent"],
               doc: "The difference set: every symbol whose output changed on some axis.\n" \
                    "`direct` probes the symbol's own render method, `hosted` probes it\n" \
                    "inside each host template with the host's own output cancelled out."),
      [
        "export interface DynamicSymbol {",
        "  readonly id: string;",
        "  readonly reason: string;",
        "  readonly formats: readonly string[];",
        "  readonly axes: readonly string[];",
        "}",
      ].join("\n"),
      ts_const("DYNAMIC_SYMBOLS", "readonly DynamicSymbol[]", probe["dynamic"],
               doc: "Classes with no static descriptor, and the axes they answer to.\n" \
                    "They are node shapes rather than ids, so they carry no slice entry."),
      [
        "export interface ValueDependentSymbol {",
        "  readonly id: string;",
        "  readonly formats: readonly string[];",
        "}",
      ].join("\n"),
      ts_const("VALUE_DEPENDENT_SYMBOLS", "readonly ValueDependentSymbol[]",
               probe["value_dependent"],
               doc: "Symbols that read the node's own `value`. Parsed symbols never carry\n" \
                    "one, so the static descriptor holds — a hand-built node may not."),
      [
        "export interface ProbeFailure {",
        "  readonly id: string;",
        "  readonly format: string;",
        "  readonly template: string;",
        "  readonly context: string;",
        "  readonly error: string;",
        "}",
      ].join("\n"),
      ts_const("PROBE_FAILURES", "readonly ProbeFailure[]", probe["failures"],
               doc: "Combinations the gem itself raises on. Recorded rather than swallowed:\n" \
                    "each one is a divergence the port has to decide about."),
      [
        "export interface ProbeSummary {",
        "  readonly symbols: number;",
        "  readonly formats: readonly string[];",
        "  readonly directRenders: number;",
        "  readonly hostedRenders: number;",
        "}",
      ].join("\n"),
      ts_const("PROBE_SUMMARY", "ProbeSummary", probe["summary"]),
    ]

    write_ts(File.join(out_root, "context-axes.ts"), sections)
  end

  def emit_provenance_file(out_root, provenance)
    record = {
      "generator" => provenance["generator"]["path"],
      "generatorSha256" => provenance["generator"]["sha256"],
      "oracle" => provenance["oracle"]["gem"],
      "oracleVersion" => provenance["oracle"]["version"],
      "oracleCommit" => provenance["oracle"]["commit"],
      "oracleClean" => provenance["oracle"]["clean"],
      "generatorClean" => provenance["generator"]["repository"]["clean"],
      "rubyEngine" => provenance["ruby"]["engine"],
      "rubyVersion" => provenance["ruby"]["version"],
      "xmlEngine" => provenance["xml_engine"],
      "committable" => provenance["committable"],
    }

    sections = [
      ts_header(<<~TEXT.chomp, provenance: false),
        What every file under `#{SYMBOL_OUT_REL}/` was generated from.

        Deliberately path-free: dirty file lists would churn on every unrelated
        edit. The full provenance, including those lists, is in the corpus
        sidecar manifests (§7).
      TEXT
      [
        "export interface GeneratedProvenance {",
        *record.keys.map { |key| "  readonly #{key}: #{record[key] == true || record[key] == false ? 'boolean' : 'string'};" },
        "}",
      ].join("\n"),
      ts_const("GENERATED_PROVENANCE", "GeneratedProvenance", record,
               doc: "`committable: false` marks output generated from a dirty checkout —\n" \
                    "useful while iterating, never to be committed (§7)."),
    ]

    write_ts(File.join(out_root, "provenance.ts"), sections)
  end

  # --- symbol data driver --------------------------------------------------

  def build_symbol_data
    classes = symbol_classes
    assert_symbol_roots!(classes)
    static = static_symbol_classes(classes)

    direct = probe_direct(static)
    hosted, failures = probe_hosted(static)

    host_only = hosted.keys - direct.keys
    unless host_only.empty?
      raise Error, <<~MESSAGE
        Host-mediated context found for #{host_only.sort.join(', ')}: the symbol's
        own render method is axis-blind, but its output changes inside a host.
        A per-symbol slice cannot express that; decide where it belongs before
        the data claims to be complete (§5).
      MESSAGE
    end

    dynamic = DYNAMIC_SYMBOL_IDS.map do |id|
      klass = Object.const_get("Plurimath::#{SYMBOL_NAMESPACE}#{id}")
      found = probe_direct([klass], value: DYNAMIC_SYMBOL_PROBE_VALUE).fetch(id, {})
      {
        "id" => id,
        "reason" => "renders from the node's own `value`, so it has no static descriptor",
        "formats" => found.keys.sort,
        "axes" => found.values.flat_map { |entry| entry["axes"] }.uniq.sort,
      }
    end

    context_dependent = direct.keys.sort.map do |id|
      {
        "id" => id,
        "formats" => direct[id].keys.sort,
        "axes" => direct[id].values.flat_map { |entry| entry["axes"] }.uniq.sort,
        "probes" => (hosted.key?(id) ? %w[direct hosted] : %w[direct]),
      }
    end

    direct_renders = static.length *
                     SYMBOL_FORMATS.sum { |format| axis_combinations(format).length }

    {
      "classes" => classes,
      "static" => static,
      "direct" => direct,
      "probe" => {
        "axes" => CONTEXT_AXES.map do |axis|
          axis.merge("values" => axis["values"].map { |value| value.nil? ? "none" : value.to_s })
        end,
        "templates" => HOST_TEMPLATES.map { |name, description| { "name" => name, "description" => description } },
        "context_dependent" => context_dependent,
        "dynamic" => dynamic,
        "value_dependent" => probe_value_dependence(static),
        "failures" => failures,
        "summary" => {
          "symbols" => static.length,
          "formats" => SYMBOL_FORMATS,
          "directRenders" => direct_renders,
          "hostedRenders" => direct_renders * HOST_TEMPLATES.length,
        },
      },
      "tables" => asciimath_input_tables(classes),
      "grammar" => asciimath_grammar_tables,
    }
  end

  # Every symbol the pinned corpus touches must resolve through the generated
  # data. This is the check that keeps the slices honest against the oracle.
  def assert_corpus_symbols_covered!(pin_cases, exclusions, data)
    withheld = exclusions.map { |entry| entry["id"] }
    ids = pin_cases.reject { |kase| withheld.include?(kase["id"]) }
      .flat_map { |kase| model_classes(kase["model"]) }
      .select { |key| key.start_with?(SYMBOL_NAMESPACE) }
      .map { |key| key.delete_prefix(SYMBOL_NAMESPACE) }.uniq.sort
    # A check that matched nothing would pass while proving nothing, which is
    # how two earlier verification scripts gave false confidence (§7).
    if ids.empty?
      raise Error, "no corpus case names a #{SYMBOL_NAMESPACE} class; the key is wrong"
    end

    covered = data["static"].map { |klass| symbol_id(klass) }
    missing = ids - covered - DYNAMIC_SYMBOL_IDS
    return if missing.empty?

    raise Error, <<~MESSAGE
      The corpus uses symbols with no generated descriptor: #{missing.join(', ')}.
      Either they are new classes or the root classification is wrong (§5).
    MESSAGE
  end

  def write_symbol_data(out_root, data, registry, render_tables, mathml_tables,
                        latex_render_tables, unicodemath_render_tables,
                        provenance)
    written = [
      File.join(out_root, INPUT_FORMAT, "input.ts"),
      File.join(out_root, INPUT_FORMAT, "grammar.ts"),
      File.join(out_root, INPUT_FORMAT, "transform-registry.ts"),
      File.join(out_root, INPUT_FORMAT, "render-tables.ts"),
      File.join(out_root, "mathml", "render-tables.ts"),
      File.join(out_root, "latex", "render-tables.ts"),
      File.join(out_root, "unicodemath", "render-tables.ts"),
    ]
    emit_input_file(out_root, data["tables"])
    emit_grammar_file(out_root, data["grammar"])
    emit_transform_registry_file(out_root, registry)
    emit_render_tables_file(out_root, render_tables)
    emit_mathml_render_tables_file(out_root, mathml_tables)
    emit_latex_render_tables_file(out_root, latex_render_tables)
    emit_unicodemath_render_tables_file(out_root, unicodemath_render_tables)

    SYMBOL_FORMATS.each do |format|
      emit_symbols_file(out_root, format, data["static"])
      emit_exceptions_file(out_root, format, data["direct"])
      written << File.join(out_root, format, "symbols.ts")
      written << File.join(out_root, format, "exceptions.ts")
    end

    emit_context_axes_file(out_root, data["probe"])
    emit_provenance_file(out_root, provenance)
    written + [File.join(out_root, "context-axes.ts"), File.join(out_root, "provenance.ts")]
  end

  # --- output --------------------------------------------------------------

  # Rebuilds a structure so no two nodes are the same object, which is what
  # makes Psych emit anchors and aliases.
  def unshare(value)
    case value
    when Hash then value.to_h { |k, v| [unshare(k), unshare(v)] }
    when Array then value.map { |v| unshare(v) }
    when String then value.dup
    else value
    end
  end

  def dump_yaml(data)
    # Psych emits YAML anchors/aliases whenever one object is referenced twice.
    # The corpus is consumed by parsers in other languages, so the payload must
    # be self-contained. Marshal is no help here — it preserves shared
    # references by design — so rebuild the structure to break identity.
    data = unshare(data)
    yaml = Psych.dump(data, line_width: -1)
    # Psych writes a nil value as `key: `, with a trailing space. Parsers do not
    # care, but it is generated output, so every regeneration would reintroduce
    # whitespace a linter or reviewer flags. Stripping it is safe only because
    # the round-trip below verifies it: had it altered anything real — content
    # inside a block scalar, say — the payload would no longer match.
    yaml = yaml.gsub(/[ \t]+$/, "")
    round_trip = Psych.safe_load(yaml, aliases: false)
    raise Error, "YAML round-trip changed the payload" unless round_trip == data

    yaml
  end

  def write_payload(path, header, data)
    body = "#{header}#{dump_yaml(data)}"
    FileUtils.mkdir_p(File.dirname(path))
    File.binwrite(path, body)
    body
  end

  def write_manifest(payload_path, payload_bytes, out_root, provenance)
    manifest = provenance.merge(
      "payload" => {
        "path" => relative(payload_path, out_root),
        "sha256" => sha256(payload_bytes),
        "bytes" => payload_bytes.bytesize,
      },
    )
    path = "#{payload_path.delete_suffix('.yaml')}.manifest.yaml"
    File.binwrite(path, "#{manifest_header}#{dump_yaml(manifest)}")
    path
  end

  def relative(path, root)
    path.delete_prefix("#{root}/")
  end

  def payload_header(kind)
    <<~HEADER
      # #{kind}
      # Generated by #{GENERATOR_PATH} from the Ruby plurimath gem. Do not edit.
      # Provenance lives in the sidecar manifest beside this file.
    HEADER
  end

  def manifest_header
    <<~HEADER
      # Sidecar provenance manifest. Generated by #{GENERATOR_PATH}; do not edit.
      # `payload.sha256` covers the whole payload file, header comments included.
    HEADER
  end

  # --- driver --------------------------------------------------------------

  def parse_options(argv)
    options = {
      gem: nil,
      out: File.join(REPO_ROOT, "corpus"),
      symbols_out: File.join(REPO_ROOT, SYMBOL_OUT_REL),
      allow_dirty: false,
    }
    until argv.empty?
      case (arg = argv.shift)
      when "--gem" then options[:gem] = File.expand_path(argv.shift.to_s)
      when "--out" then options[:out] = File.expand_path(argv.shift.to_s)
      when "--symbols-out" then options[:symbols_out] = File.expand_path(argv.shift.to_s)
      when "--allow-dirty" then options[:allow_dirty] = true
      when "--help", "-h" then options[:help] = true
      else raise Error, "unknown option #{arg.inspect}"
      end
    end
    options
  end

  def usage
    File.readlines(File.join(REPO_ROOT, GENERATOR_PATH))
      .drop(2).take_while { |line| line.start_with?("#") }
      .map { |line| line.sub(/\A# ?/, "") }.join
  end

  def loaded_gem_dir
    loaded = Gem.loaded_specs["plurimath"]
    raise Error, "the plurimath gem is not loaded; set BUNDLE_GEMFILE" unless loaded

    File.expand_path(loaded.full_gem_path)
  end

  def check_checkouts!(gem_dir, requested_gem_dir, out_roots, allow_dirty)
    unless git_repository?(gem_dir)
      raise Error, "#{gem_dir} is not a git checkout; the oracle must be one (§7)"
    end

    gem_dirty = dirty_paths(gem_dir)
    generated = out_roots.map { |root| relative(root, REPO_ROOT) }
    repo_dirty = dirty_paths(REPO_ROOT, except: generated)
    dirty = { "gem" => gem_dirty, "generator" => repo_dirty }

    if !allow_dirty && !(gem_dirty.empty? && repo_dirty.empty?)
      raise Error, <<~MESSAGE
        Refusing to generate from a dirty checkout (ARCHITECTURE.md §7).
          gem       #{gem_dir}: #{gem_dirty.empty? ? 'clean' : gem_dirty.join(', ')}
          generator #{REPO_ROOT}: #{repo_dirty.empty? ? 'clean' : repo_dirty.join(', ')}
        Commit or stash, or pass --allow-dirty to produce non-committable output.
      MESSAGE
    end

    if requested_gem_dir && requested_gem_dir != loaded_gem_dir
      raise Error, <<~MESSAGE
        --gem #{requested_gem_dir} is not the checkout bundler loaded
        (#{loaded_gem_dir}). Point BUNDLE_GEMFILE at the same checkout, so the
        recorded provenance describes the code that actually ran.
      MESSAGE
    end

    dirty
  end

  def build_provenance(gem_dir, dirty, allow_dirty)
    gem_spec = Gem.loaded_specs.fetch("plurimath")
    dependencies = dependency_provenance(gem_dir, gem_spec)

    unless dependencies[:external_path_sources].empty?
      message = "path-pinned gems are rejected for canonical generation (§7): " \
                "#{dependencies[:external_path_sources].join(', ')}"
      raise Error, message unless allow_dirty
    end

    warnings = []
    warnings << "generated with --allow-dirty" if allow_dirty
    unless dirty["gem"].empty?
      warnings << "oracle checkout dirty: #{dirty['gem'].join(', ')}"
    end
    unless dirty["generator"].empty?
      warnings << "generator checkout dirty: #{dirty['generator'].join(', ')}"
    end
    unless dependencies[:external_path_sources].empty?
      warnings << "path-pinned gems: #{dependencies[:external_path_sources].join(', ')}"
    end

    {
      "schema" => MANIFEST_SCHEMA,
      "committable" => warnings.empty?,
      "warnings" => warnings,
      "generator" => {
        "path" => GENERATOR_PATH,
        "sha256" => sha256(File.binread(File.join(REPO_ROOT, GENERATOR_PATH))),
        "repository" => checkout_provenance(REPO_ROOT, dirty["generator"]),
      },
      "oracle" => {
        "gem" => "plurimath",
        "version" => gem_spec.version.to_s,
        "kind" => "git-checkout",
      }.merge(checkout_provenance(gem_dir, dirty["gem"])),
      "ruby" => {
        "engine" => RUBY_ENGINE,
        "version" => RUBY_VERSION,
      },
      "xml_engine" => Plurimath.xml_engine.to_s,
      "configuration" => configuration_provenance,
      "dependencies" => dependencies[:provenance],
    }
  end

  # The exclusion list is built from the seed inputs above; the cases are built
  # in another repository. These two checks are what stops the two lists from
  # drifting apart without anyone noticing.
  def assert_pin_exclusions_complete!(pin_cases, exclusions)
    withheld = exclusions.to_h { |entry| [entry["id"], entry] }

    unclassified = pin_cases.select do |kase|
      deferred_feature_for(kase["input"]) && !withheld.key?(kase["id"])
    end
    unless unclassified.empty?
      raise Error, <<~MESSAGE
        The pin has cases using a deferred construct that corpus/exclusions.yaml does
        not withhold: #{unclassified.map { |k| "#{k['id']} (#{k['input'].inspect})" }.join(', ')}.
        Add them to GROUPS here, or widen DEFERRED_INPUT_PATTERNS (§5).
      MESSAGE
    end

    leaked = pin_cases.reject { |kase| withheld.key?(kase["id"]) }
      .flat_map { |kase| model_classes(kase["model"]).map { |key| [kase["id"], key] } }
      .select { |_id, key| DEFERRED_CLASSES.include?(key) }
    unless leaked.empty?
      raise Error, <<~MESSAGE
        Deferred classes reach cases the port does not withhold: #{leaked.map { |id, k| "#{id}=>#{k}" }.join(', ')}.
        The deferred-feature classifier matches input text; widen it (§5).
      MESSAGE
    end

    mismatched = pin_cases.filter_map do |kase|
      entry = withheld[kase["id"]]
      next if entry.nil? || entry["input"] == kase["input"]

      "#{kase['id']}: pin has #{kase['input'].inspect}, exclusions say #{entry['input'].inspect}"
    end
    return if mismatched.empty?

    raise Error, <<~MESSAGE
      Exclusion ids no longer name the same inputs as the pin:
        #{mismatched.join("\n  ")}
      Ids are the join key between the pin and this repository; they must not move.
    MESSAGE
  end

  def run(argv)
    options = parse_options(argv)
    if options[:help]
      puts usage
      return 0
    end

    require_ox_engine!
    gem_dir = options[:gem] || loaded_gem_dir
    dirty = check_checkouts!(gem_dir, options[:gem],
                             [options[:out], options[:symbols_out]],
                             options[:allow_dirty])
    load_model_classes!(gem_dir)

    provenance = build_provenance(gem_dir, dirty, options[:allow_dirty])
    pin_cases = read_pin_cases
    exclusions = build_exclusions
    assert_pin_exclusions_complete!(pin_cases, exclusions)
    census = build_census(gem_dir)
    symbols = build_symbol_data
    registry = build_transform_registry(gem_dir, census)
    latex_render_tables = build_latex_render_tables(registry)
    render_tables = build_render_tables
    mathml_tables = build_mathml_render_tables(registry)
    unicodemath_render_tables = build_unicodemath_render_tables(registry)
    assert_corpus_symbols_covered!(pin_cases, exclusions, symbols)

    out_root = options[:out]
    written = []

    exclusions_payload = {
      "schema" => EXCLUSIONS_SCHEMA,
      "description" => "Cases withheld from every generator because their " \
                       "input matches a deferred construct (ARCHITECTURE.md §5).",
      "features" => DEFERRED_INPUT_PATTERNS.keys.sort,
      "classes" => DEFERRED_CLASSES,
      "excluded" => exclusions.sort_by { |e| e["id"] },
    }
    path = File.join(out_root, "exclusions.yaml")
    bytes = write_payload(path, payload_header("Deferred-feature exclusion manifest."),
                          exclusions_payload)
    written << [path, write_manifest(path, bytes, out_root, provenance)]

    path = File.join(out_root, "census.yaml")
    bytes = write_payload(path, payload_header("Plurimath::Math::Core node census."), census)
    written << [path, write_manifest(path, bytes, out_root, provenance)]

    emitted = write_symbol_data(options[:symbols_out], symbols, registry, render_tables,
                                mathml_tables, latex_render_tables,
                                unicodemath_render_tables, provenance)

    written.each do |payload_path, manifest_path|
      puts "  #{relative(payload_path, REPO_ROOT)}"
      puts "  #{relative(manifest_path, REPO_ROOT)}"
    end
    emitted.sort.each { |path| puts "  #{relative(path, REPO_ROOT)}" }
    puts "pin #{PIN_RELATIVE_PATH}: #{pin_cases.length} cases read, " \
         "#{exclusions.length} withheld, #{census['summary']['total']} classes censused"
    probe = symbols["probe"]
    puts "#{symbols['static'].length} symbols across #{SYMBOL_FORMATS.join(', ')}; " \
         "#{symbols['tables']['counts']['merged']} inputs, " \
         "#{symbols['tables']['counts']['literals']} literals"
    puts "grammar tables: " \
         "#{symbols['grammar']['counts'].map { |name, count| "#{name} #{count}" }.join(', ')}"
    puts "transform registry: " \
         "#{registry['counts'].map { |name, count| "#{name} #{count}" }.join(', ')}"
    puts "render tables: " \
         "#{render_tables.map { |name, table| "#{name} #{table.length}" }.join(', ')}"
    puts "mathml render tables: " \
         "#{mathml_tables.map { |name, table| "#{name} #{table.length}" }.join(', ')}"
    puts "latex render tables: " \
         "#{latex_render_tables.map { |name, table| "#{name} #{table.length}" }.join(', ')}"
    puts "context-dependent: " \
         "#{probe['context_dependent'].map { |e| e['id'] }.join(', ')}"
    probe["dynamic"].each do |entry|
      puts "  dynamic #{entry['id']}: axes #{entry['axes'].join(', ')} " \
           "(#{entry['formats'].join(', ')})"
    end
    puts "  probe failures: #{probe['failures'].length}" unless probe["failures"].empty?
    puts "committable: #{provenance['committable']}"
    provenance["warnings"].each { |warning| puts "  ! #{warning}" }
    0
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    exit CorpusGenerator.run(ARGV)
  rescue CorpusGenerator::Error => e
    warn "generate-corpus: #{e.message}"
    exit 1
  end
end
