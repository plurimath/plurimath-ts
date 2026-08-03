# frozen_string_literal: true

# Generates the AsciiMath conformance corpus, the node census and the
# per-format symbol data from the Ruby plurimath gem, which is the oracle
# (ARCHITECTURE.md §1).
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
#   corpus/asciimath/<group>.yaml   conformance cases, grouped by feature
#   corpus/census.yaml              every Math::Core descendant, classified
#   corpus/exclusions.yaml          cases withheld because of a deferred feature
#   corpus/**/<payload>.manifest.yaml
#
# Symbol data (TypeScript, one file set per format — never one merged blob, so
# a renderer can bundle only its own slice, §3/§5):
#   src/generated/asciimath/input.ts       input text -> symbol id + literals
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

  CORPUS_SCHEMA = "plurimath-corpus/asciimath/1"
  # 2 adds `defaults` (constructor-assigned field values) to each class entry.
  CENSUS_SCHEMA = "plurimath-corpus/census/2"
  EXCLUSIONS_SCHEMA = "plurimath-corpus/exclusions/1"
  MANIFEST_SCHEMA = "plurimath-corpus/manifest/1"

  INPUT_FORMAT = "asciimath"
  TARGET_FORMATS = %w[asciimath latex mathml].freeze

  # --- symbol data ---------------------------------------------------------

  SYMBOL_NAMESPACE = "Math::Symbols::"
  SYMBOL_OUT_REL = "src/generated"

  # A symbol slice is only provable where the corpus can check it, so the
  # slices cover exactly the formats the corpus targets.
  SYMBOL_FORMATS = TARGET_FORMATS

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
      "formats" => %w[asciimath latex mathml].freeze,
      "mechanism" => "options[:table], which Td sets for a Formula cell",
    },
    {
      "name" => "rspace",
      "values" => [nil, "thickmathspace"],
      "formats" => %w[asciimath latex mathml].freeze,
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

  # Seed corpus. Ids are stable and hand-assigned: they are the join key
  # between the payload, the exclusion manifest, and the TypeScript suite, so
  # they must not move when a case is inserted.
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
          entry = { "kind" => source["kind"], "remote" => source["remote"],
                    "gems" => source["specs"].sort }
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

  def serialize_tree(node, path)
    case node
    when nil, true, false, ::String, ::Integer, ::Float then node
    when ::Symbol then node.to_s
    when ::Parslet::Slice then node.to_s
    when ::Array then node.each_with_index.map { |n, i| serialize_tree(n, "#{path}[#{i}]") }
    when ::Hash
      node.to_h { |key, value| [key.to_s, serialize_tree(value, "#{path}.#{key}")] }
    else
      raise Error, "cannot serialize parse tree node #{node.class} at #{path}"
    end
  end

  def node_classes(value, acc = [])
    case value
    when Plurimath::Math::Core
      acc << class_key(value.class)
      value.variables.each { |ivar| node_classes(value.get(ivar), acc) }
    when ::Array then value.each { |v| node_classes(v, acc) }
    when ::Hash then value.each_value { |v| node_classes(v, acc) }
    end
    acc
  end

  # --- corpus --------------------------------------------------------------

  def build_case(id, input)
    formula = Plurimath::Math.parse(input, INPUT_FORMAT.to_sym)
    preprocessed = Plurimath::Asciimath::Parser.new(input).text
    tree = Plurimath::Asciimath::Parse.new.parse(preprocessed)

    {
      "id" => id,
      "input" => input,
      "input_format" => INPUT_FORMAT,
      "preprocessed" => preprocessed,
      "expected" => {
        "asciimath" => formula.to_asciimath,
        "latex" => formula.to_latex,
        "mathml" => formula.to_mathml,
      },
      "parse_tree" => serialize_tree(tree, id),
      "model" => serialize_node(formula, id),
      "_classes" => node_classes(formula).uniq.sort,
    }
  end

  def build_corpus
    groups = []
    exclusions = []

    GROUPS.each do |name, description, cases|
      built = cases.filter_map do |id, input|
        feature = deferred_feature_for(input)
        if feature
          exclusions << {
            "id" => id,
            "group" => name,
            "input" => input,
            "input_format" => INPUT_FORMAT,
            "feature" => feature,
            "matched" => DEFERRED_INPUT_PATTERNS.fetch(feature).source,
            "reason" => "#{feature} is deferred (ARCHITECTURE.md §5); matched " \
                        "on the input text, since the gem raises for invalid " \
                        "#{feature} and produces no formula to inspect",
          }
          next
        end

        begin
          build_case(id, input)
        rescue StandardError => e
          raise Error, "case #{id} (#{input.inspect}) failed: #{e.class}: #{e.message}"
        end
      end

      groups << [name, description, built]
    end

    [groups, exclusions]
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
    else raise Error, "unknown target format #{format.inspect}"
    end
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
    }
  end

  # Every symbol the seed corpus touches must resolve through the generated
  # data. This is the check that keeps the slices honest against the oracle.
  def assert_corpus_symbols_covered!(groups, data)
    ids = groups.flat_map { |_name, _description, cases| cases }
      .flat_map { |kase| kase["_classes"] }
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

  def write_symbol_data(out_root, data, provenance)
    written = [File.join(out_root, INPUT_FORMAT, "input.ts")]
    emit_input_file(out_root, data["tables"])

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

  def assert_no_deferred_classes!(groups)
    deferred = groups.flat_map { |_name, _description, cases| cases }
      .flat_map { |kase| kase["_classes"].map { |k| [kase["id"], k] } }
      .select { |_id, key| DEFERRED_CLASSES.include?(key) }
    return if deferred.empty?

    raise Error, <<~MESSAGE
      Deferred classes reached the corpus: #{deferred.map { |id, k| "#{id}=>#{k}" }.join(', ')}.
      The deferred-feature classifier matches input text; widen it (§5).
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
    groups, exclusions = build_corpus
    assert_no_deferred_classes!(groups)
    census = build_census(gem_dir)
    symbols = build_symbol_data
    assert_corpus_symbols_covered!(groups, symbols)

    out_root = options[:out]
    written = []

    groups.each do |name, description, cases|
      payload = {
        "schema" => CORPUS_SCHEMA,
        "group" => name,
        "description" => description,
        "input_format" => INPUT_FORMAT,
        "targets" => TARGET_FORMATS,
        "cases" => cases.map { |kase| kase.reject { |key, _| key == "_classes" } },
      }
      path = File.join(out_root, "asciimath", "#{name}.yaml")
      bytes = write_payload(path, payload_header("AsciiMath conformance cases: #{name}."), payload)
      written << [path, write_manifest(path, bytes, out_root, provenance)]
    end

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

    emitted = write_symbol_data(options[:symbols_out], symbols, provenance)

    case_count = groups.sum { |_name, _description, cases| cases.length }
    written.each do |payload_path, manifest_path|
      puts "  #{relative(payload_path, REPO_ROOT)}"
      puts "  #{relative(manifest_path, REPO_ROOT)}"
    end
    emitted.sort.each { |path| puts "  #{relative(path, REPO_ROOT)}" }
    puts "#{case_count} cases in #{groups.length} groups, " \
         "#{exclusions.length} excluded, #{census['summary']['total']} classes"
    probe = symbols["probe"]
    puts "#{symbols['static'].length} symbols across #{SYMBOL_FORMATS.join(', ')}; " \
         "#{symbols['tables']['counts']['merged']} inputs, " \
         "#{symbols['tables']['counts']['literals']} literals"
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
