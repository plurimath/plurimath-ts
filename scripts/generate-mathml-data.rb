#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the data the MathML input side needs from the oracle:
#
# - `mml-schema.ts`: the `Mml::V4` class schema the element layer builds its
#   tree from, for every class reachable from `Mml::V4::Math`;
# - `transform-tables.ts`: what `Plurimath::Mathml::Translator` resolves at
#   runtime through the gem (`Utility.symbols_class(..., lang: :mathml)`,
#   `Utility.get_class`, `Mathml::Constants`), and the class facts it asks of
#   the nodes it builds (`is_nary_symbol?`, `paren?`, `is_nary_function?`,
#   `new_nary_function`, `class_name`, family).
#
# Usage:
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-mathml-data.rb [--gem PATH] [--out DIR] [--allow-dirty]
#
# Writes:
#   src/formats/mathml/generated/mml-schema.ts        the class schema
#   src/formats/mathml/generated/transform-tables.ts  the translator's tables
#   src/formats/mathml/generated/provenance.ts  what it was generated from
#
# The schema is read from lutaml-model's own XML mappings, never from the mml
# gem's source text:
#
# - a class's child elements: the XML name, the class it builds, and whether
#   the attribute holding it is a collection (a non-collection child keeps only
#   its first occurrence);
# - whether the mapping is ordered (an unordered class exposes no
#   `each_mixed_content` children) and whether, and how, it maps text content
#   onto `value`;
# - for the attributes the Plurimath translator reads (`READ_ATTRIBUTES`), the
#   XML name and the lutaml type (`string` or `integer`).
#
# Schema classes are named by their `Mml::V4::` suffix; Plurimath classes by
# their full `Math::` key, as the census names them. The output is deterministic.

require_relative "generate-core-data"

module MathmlDataGenerator
  class Error < StandardError; end

  REPO_ROOT = File.expand_path("..", __dir__)
  GENERATOR_PATH = "scripts/generate-mathml-data.rb"
  OUT_REL = "src/formats/mathml/generated"

  GENERATOR_INPUT_PATHS = [
    GENERATOR_PATH,
    CoreDataGenerator::GENERATOR_PATH,
    CorpusGenerator::GENERATOR_PATH,
  ].freeze

  # Every `.name` the translator (lib/plurimath/mathml/*.rb) calls that an
  # `Mml::V4` class declares as an attribute, less `value` and the three
  # collections it reaches through `each_mixed_content` anyway
  # (`annotation_value`, `annotation_xml_value`, `mprescripts_value`).
  # scripts/generate-mathml-model-fixtures.rb records the same list.
  READ_ATTRIBUTES = %w[
    accent accentunder alt bevelled close columnlines depth display displaystyle
    frame height id index intent length linebreak linebreakstyle linethickness
    mathcolor mathvariant name notation open rowlines rspace separators src width
  ].freeze

  TYPES = {
    "Lutaml::Model::Type::String" => "string",
    "Lutaml::Model::Type::Integer" => "integer",
  }.freeze

  module_function

  def short(klass)
    name = klass.name.to_s
    raise Error, "#{name} is not an Mml::V4 class" unless name.start_with?("Mml::V4::")

    name.delete_prefix("Mml::V4::")
  end

  def resolve(attribute)
    attribute.type(:mml_v4)
  end

  # Every class reachable from `Math`, in discovery order, with its mapping.
  def classes
    todo = [Mml::V4::Math]
    seen = {}
    until todo.empty?
      klass = todo.shift
      next if seen.key?(klass)

      seen[klass] = true
      klass.mappings_for(:xml).elements.each do |rule|
        type = resolve(klass.attributes.fetch(rule.to))
        todo << type if type.is_a?(Class) && type.name.to_s.start_with?("Mml::V4::")
      end
    end
    seen.keys.sort_by { |klass| short(klass) }
  end

  def child_rules(klass)
    klass.mappings_for(:xml).elements.map do |rule|
      attribute = klass.attributes.fetch(rule.to)
      type = resolve(attribute)
      unless type.is_a?(Class) && type.name.to_s.start_with?("Mml::V4::")
        raise Error, "#{short(klass)}.#{rule.name} maps to #{type.inspect}, not an Mml::V4 class"
      end

      [rule.name.to_s, short(type), attribute.collection? ? true : false]
    end
  end

  # `"collection"` (value is always an array), `"single"` (a string, or an array
  # when there is more than one text node), or null for no text content.
  def content_kind(klass)
    mapping = klass.mappings_for(:xml).content_mapping
    return nil if mapping.nil?
    raise Error, "#{short(klass)} maps content onto #{mapping.to}, not value" unless mapping.to == :value

    klass.attributes.fetch(:value).collection? ? "collection" : "single"
  end

  def read_attributes(klass)
    klass.mappings_for(:xml).attributes.filter_map do |rule|
      next unless READ_ATTRIBUTES.include?(rule.to.to_s)

      type = resolve(klass.attributes.fetch(rule.to)).name
      kind = TYPES.fetch(type) { raise Error, "#{short(klass)}.#{rule.to}: unexpected type #{type}" }
      unless rule.name.to_s == rule.to.to_s
        raise Error, "#{short(klass)}.#{rule.to} is read from XML #{rule.name}; the layer assumes equal names"
      end

      [rule.name.to_s, kind]
    end.sort
  end

  def schema
    child_sets = []
    rows = classes.map do |klass|
      rules = child_rules(klass)
      index = child_sets.index(rules) || (child_sets << rules).length - 1
      ordered = klass.mappings_for(:xml).instance_variable_get(:@ordered) ? true : false
      [short(klass), ordered, content_kind(klass), index, read_attributes(klass)]
    end
    { child_sets: child_sets, classes: rows }
  end

  # `CoreDataGenerator.ts_value`, plus the rule Biome takes from Prettier: an
  # array of two or more elements that are all arrays of two or more elements
  # always breaks, one element per line, even when it would fit, and so does
  # every array around it.
  def ts_value(value, indent, column = indent * 2)
    flat = CoreDataGenerator.ts_flat(value)
    return flat if !must_break?(value) && column + flat.length + 1 <= CoreDataGenerator::TS_PRINT_WIDTH
    return flat unless value.is_a?(::Array) && !value.empty?

    pad = "  " * indent
    lines = value.map { |item| "#{pad}  #{ts_value(item, indent + 1)}," }
    (["["] + lines + ["#{pad}]"]).join("\n")
  end

  # A broken array also breaks every array that contains it.
  def must_break?(value)
    return false unless value.is_a?(::Array)
    return true if value.length > 1 && value.all? { |item| item.is_a?(::Array) && item.length > 1 }

    value.any? { |item| must_break?(item) }
  end

  def ts_const(name, type, value, doc:)
    prefix = "export const #{name}: #{type} = "
    [CoreDataGenerator.ts_doc(doc), "#{prefix}#{ts_value(value, 0, prefix.length)};"].join("\n")
  end

  def emit_schema_file(out_root, data)
    gem_version = Gem.loaded_specs.fetch("mml").version.to_s
    sections = [
      CoreDataGenerator.ts_doc(<<~TEXT.chomp),
        GENERATED FILE — do not edit, regenerate.

        Emitted by #{GENERATOR_PATH} from the mml #{gem_version} gem the oracle
        parses MathML with (ARCHITECTURE.md §1). What it was generated from is in
        `#{OUT_REL}/provenance.ts`.

        How `Mml.parse(text, version: 4)` maps an XML element onto each
        `Mml::V4` class reachable from `Math`, read from lutaml-model's mappings.
      TEXT
      [
        "/** A child element rule: XML name, the class it builds, whether it is a collection. */",
        "export type MmlChildRule = readonly [string, string, boolean];",
        "",
        "/** A read attribute: XML name (equal to the attribute name) and its lutaml type. */",
        'export type MmlAttributeRule = readonly [string, "string" | "integer"];',
        "",
        "/** Class name, ordered mapping, text content kind, child-set index, read attributes. */",
        "export type MmlClassRow = readonly [",
        "  string,",
        "  boolean,",
        '  "collection" | "single" | null,',
        "  number,",
        "  readonly MmlAttributeRule[],",
        "];",
      ].join("\n"),
      ts_const(
        "MML_READ_ATTRIBUTES", "readonly string[]", READ_ATTRIBUTES,
        doc: "The attributes the Plurimath translator reads; the layer exposes no others.",
      ),
      ts_const(
        "MML_CHILD_SETS", "readonly (readonly MmlChildRule[])[]", data[:child_sets],
        doc: "The distinct child element rule lists, shared by index from `MML_CLASSES`.",
      ),
      ts_const(
        "MML_CLASSES", "readonly MmlClassRow[]", data[:classes],
        doc: "Every class reachable from `Math`, sorted by name.",
      ),
    ]
    CoreDataGenerator.write_ts(File.join(out_root, "mml-schema.ts"), sections)
  end

  # --- the translator's tables -----------------------------------------------

  def math
    Plurimath::Math
  end

  def key(klass)
    CorpusGenerator.class_key(klass)
  end

  # A value `Klass.new` assigned, as the tables carry it: nil, a boolean, or an
  # empty array or hash (as the markers "[]" and "{}"). Anything else would
  # need a richer encoding, so generation stops.
  def default_value(value, where)
    case value
    when nil, true, false then value
    when ::Array
      raise Error, "#{where}: non-empty default array" unless value.empty?

      "[]"
    when ::Hash
      raise Error, "#{where}: non-empty default hash" unless value.empty?

      "{}"
    else raise Error, "#{where}: default #{value.class} has no encoding"
    end
  end

  def defaults(klass)
    instance = klass.new
    instance.instance_variables.sort.map do |ivar|
      field = ivar.to_s.delete_prefix("@")
      [field, default_value(instance.instance_variable_get(ivar), "#{key(klass)}.#{field}")]
    end
  end

  def census_index(gem_dir)
    CorpusGenerator.load_model_classes!(gem_dir)
    CorpusGenerator.build_census(gem_dir).fetch("classes").to_h { |entry| [entry["name"], entry] }
  end

  # The carrier every Plurimath class the translator can build rides on.
  def carrier_rows(census)
    classes = math::Function.constants.map { |name| math::Function.const_get(name) }
    classes += math::Function::FontStyle.constants.map { |name| math::Function::FontStyle.const_get(name) }
    classes += [math::Formula, math::Formula::Mrow, math::Formula::Mstyle, math::Number]
    classes.select { |klass| klass.is_a?(Class) }.uniq.map do |klass|
      entry = census.fetch(key(klass)) { raise Error, "#{key(klass)} is not in the census" }
      [key(klass), entry["aliases"] || key(klass), entry.fetch("disposition")]
    end.sort
  end

  def function_family(klass)
    if klass <= math::Function::TernaryFunction then "ternary"
    elsif klass <= math::Function::BinaryFunction then "binary"
    elsif klass <= math::Function::UnaryFunction then "unary"
    else "none"
    end
  end

  # A symbol whose `is_nary_symbol?` is true, measured rather than named.
  def nary_symbol
    klass = symbol_classes.find { |candidate| candidate.new.is_nary_symbol? }
    raise Error, "no symbol class answers is_nary_symbol?" unless klass

    klass.new
  end

  # How a function class answers `is_nary_function?`: `always`, through one of
  # its parameters (`parameterOne`/`parameterTwo`, which raise on nil), or
  # `never` (Core's, which returns nil). Measured on instances, not read.
  def nary_function_rule(klass)
    return "never" if klass.instance_method(:is_nary_function?).owner == math::Core

    plain = math::Symbols::Symbol.new("x")
    begin
      return "always" if klass.new.is_nary_function?
    rescue ::NoMethodError
      nil
    end
    %w[one two].each do |slot|
      instance = klass.new
      %w[one two three].each do |other|
        next unless instance.respond_to?("parameter_#{other}=")

        instance.public_send("parameter_#{other}=", other == slot ? nary_symbol : plain)
      end
      return "parameter#{slot.capitalize}" if instance.is_nary_function?
    end
    raise Error, "#{key(klass)}: is_nary_function? matches no measured rule"
  end

  # `new_nary_function(d)`: which of the receiver's parameters land in the
  # Nary's first three slots, and the options it passes.
  def new_nary_rule(klass)
    markers = %w[one two three].to_h { |slot| [slot, math::Symbols::Symbol.new("@#{slot}")] }
    instance = klass.new
    markers.each do |slot, marker|
      instance.public_send("parameter_#{slot}=", marker) if instance.respond_to?("parameter_#{slot}=")
    end
    fourth = math::Symbols::Symbol.new("@four")
    nary = instance.new_nary_function(fourth)
    raise Error, "#{key(klass)}: new_nary_function built #{nary.class}" unless nary.is_a?(math::Function::Nary)
    raise Error, "#{key(klass)}: new_nary_function moved the fourth value" unless nary.parameter_four.equal?(fourth)

    slots = [nary.parameter_one, nary.parameter_two, nary.parameter_three].map do |value|
      value.nil? ? nil : markers.key(value) || raise(Error, "#{key(klass)}: unexpected Nary slot")
    end
    type = nary.options&.fetch(:type, nil)
    [slots, type]
  end

  def function_rows
    classes = math::Function.constants.map { |name| math::Function.const_get(name) }
    classes += math::Function::FontStyle.constants.map { |name| math::Function::FontStyle.const_get(name) }
    classes.select { |klass| klass.is_a?(Class) }.uniq.sort_by { |klass| key(klass) }.map do |klass|
      default_name = klass.name.split("::").last.downcase
      class_name = klass.instance_method(:class_name).owner == math::Core ? nil : klass.allocate.class_name
      nary = klass.method_defined?(:new_nary_function) ? new_nary_rule(klass) : nil
      [
        key(klass),
        function_family(klass),
        class_name == default_name ? nil : class_name,
        nary_function_rule(klass),
        nary,
      ]
    end
  end

  def symbol_input_rows
    symbols = Plurimath::Utility.symbols_hash(:mathml)
    parens = Plurimath::Utility.parens_hash(:mathml)
    merged = Plurimath::Utility.all_symbols_classes(:mathml)
    unless merged.length == (symbols.keys | parens.keys).length
      raise Error, "all_symbols_classes(:mathml) is not the union of its two halves"
    end

    merged.map do |text, klass|
      raise Error, "all_symbols_classes(:mathml) is keyed by #{text.class}" unless text.is_a?(::String)

      [text, CorpusGenerator.symbol_id(klass)]
    end
  end

  def symbol_classes
    CorpusGenerator.symbol_classes
  end

  def nary_symbol_ids
    symbol_classes.select { |klass| klass.new.is_nary_symbol? }.map { |k| CorpusGenerator.symbol_id(k) }.sort
  end

  # Paren classes, and those whose `to_asciimath(options: {})` is "(": what
  # `opening_paren?` (formula_transformation.rb) tests besides `lround`.
  def paren_rows
    math::Symbols::Paren.descendants.uniq.sort_by(&:name).map do |klass|
      instance = klass.new
      raise Error, "#{klass} is not paren?" unless instance.paren?

      [CorpusGenerator.symbol_id(klass), instance.to_asciimath(options: {}) == "("]
    end
  end

  # Symbol classes whose `class_name` is not their downcased basename.
  def symbol_class_name_rows
    symbol_classes.filter_map do |klass|
      name = klass.new.class_name
      [CorpusGenerator.symbol_id(klass), name] unless name == klass.name.split("::").last.downcase
    end
  end

  def constants
    Plurimath::Mathml::Constants
  end

  # Every name `Utility.get_class` can receive from the translator:
  # `function_from_token`'s two arms and `contextual_accent_from_token`.
  def get_class_rows
    unicode = constants::UNICODE_SYMBOLS.values.map { |value| value.strip }
    named = constants::NAMED_FUNCTION_WORDS
    names = ((unicode & constants::CLASSES) | (named & constants::CLASSES) |
             constants::CONTEXTUAL_ACCENT_FUNCTIONS.values).sort
    names.map do |name|
      klass = begin
        Plurimath::Utility.get_class(name)
      rescue ::NameError
        nil
      end
      klass.nil? ? [name, nil, []] : [name, key(klass), defaults(klass)]
    end
  end

  def font_style_rows
    Plurimath::Utility::FONT_STYLES.map { |keyword, klass| [keyword.to_s, key(klass)] }
  end

  def transform_data(gem_dir)
    census = census_index(gem_dir)
    {
      carriers: carrier_rows(census),
      functions: function_rows,
      symbol_input: symbol_input_rows,
      nary_symbols: nary_symbol_ids,
      parens: paren_rows,
      symbol_class_names: symbol_class_name_rows,
      unicode_symbols: constants::UNICODE_SYMBOLS.map { |entity, name| [entity.to_s, name] },
      contextual_accents: constants::CONTEXTUAL_ACCENT_FUNCTIONS.map { |entity, name| [entity.to_s, name] },
      classes: constants::CLASSES,
      named_function_words: constants::NAMED_FUNCTION_WORDS,
      get_class: get_class_rows,
      font_styles: font_style_rows,
      unary_classes: Plurimath::Utility::UNARY_CLASSES,
    }
  end

  def emit_transform_file(out_root, data)
    tuple_map = lambda do |name, type, rows, doc|
      next CoreDataGenerator.ts_tuple_map(name, type, rows, doc: doc) unless rows.empty?

      [CoreDataGenerator.ts_doc(doc), "export const #{name}: #{type} = new Map([]);"].join("\n")
    end
    sections = [
      CoreDataGenerator.ts_doc(<<~TEXT.chomp),
        GENERATED FILE — do not edit, regenerate.

        Emitted by #{GENERATOR_PATH} from the Plurimath Ruby gem, the oracle
        (ARCHITECTURE.md §1). What it was generated from is in
        `#{OUT_REL}/provenance.ts`.

        What `Plurimath::Mathml::Translator` resolves through the gem at runtime,
        measured class by class.
      TEXT
      [
        "/** Class key, `is_a?` family, `class_name` override, `is_nary_function?`, `new_nary_function`. */",
        "export type MathmlFunctionRow = readonly [",
        "  string,",
        '  "unary" | "binary" | "ternary" | "none",',
        "  string | null,",
        '  "never" | "always" | "parameterOne" | "parameterTwo",',
        "  readonly [readonly (string | null)[], string | null] | null,",
        "];",
        "",
        "/** A `Klass.new` default: nil, a boolean, or the empty-collection markers. */",
        'export type MathmlDefault = boolean | null | "[]" | "{}";',
        "",
        "/** A `get_class` name, the class it reaches (null: NameError), and `.new`'s ivars. */",
        "export type MathmlGetClassRow = readonly [",
        "  string,",
        "  string | null,",
        "  readonly (readonly [string, MathmlDefault])[],",
        "];",
      ].join("\n"),
      ts_const(
        "MATHML_CARRIERS", "readonly (readonly [string, string, string])[]", data[:carriers],
        doc: "Each class the translator can build: its census key, carrier and disposition.",
      ),
      ts_const(
        "MATHML_FUNCTIONS", "readonly MathmlFunctionRow[]", data[:functions],
        doc: "Every `Math::Function` class and the facts the translator asks of it.",
      ),
      tuple_map.call(
        "MATHML_SYMBOL_CLASS_INPUT", "ReadonlyMap<string, string>", data[:symbol_input],
        "`Utility.all_symbols_classes(:mathml)`: stripped text -> symbol id.",
      ),
      ts_const(
        "MATHML_NARY_SYMBOL_IDS", "readonly string[]", data[:nary_symbols],
        doc: "Symbol ids whose `is_nary_symbol?` is true.",
      ),
      tuple_map.call(
        "MATHML_PAREN_SYMBOLS", "ReadonlyMap<string, boolean>", data[:parens],
        "Paren symbol ids -> whether `to_asciimath(options: {})` is `(`.",
      ),
      tuple_map.call(
        "MATHML_SYMBOL_CLASS_NAMES", "ReadonlyMap<string, string>", data[:symbol_class_names],
        "Symbol ids whose `class_name` is not their downcased basename.",
      ),
      tuple_map.call(
        "MATHML_UNICODE_SYMBOLS", "ReadonlyMap<string, string>", data[:unicode_symbols],
        "`Mathml::Constants::UNICODE_SYMBOLS`.",
      ),
      tuple_map.call(
        "MATHML_CONTEXTUAL_ACCENT_FUNCTIONS", "ReadonlyMap<string, string>", data[:contextual_accents],
        "`Mathml::Constants::CONTEXTUAL_ACCENT_FUNCTIONS`.",
      ),
      ts_const(
        "MATHML_CLASSES", "readonly string[]", data[:classes],
        doc: "`Mathml::Constants::CLASSES`.",
      ),
      ts_const(
        "MATHML_NAMED_FUNCTION_WORDS", "readonly string[]", data[:named_function_words],
        doc: "`Mathml::Constants::NAMED_FUNCTION_WORDS`.",
      ),
      ts_const(
        "MATHML_GET_CLASS", "readonly MathmlGetClassRow[]", data[:get_class],
        doc: "Each name `Utility.get_class` can receive: the class it reaches (null where the\n" \
             "gem raises NameError) and what `.new` assigns.",
      ),
      tuple_map.call(
        "MATHML_FONT_STYLES", "ReadonlyMap<string, string>", data[:font_styles],
        "`Utility::FONT_STYLES`: mathvariant -> FontStyle class key.",
      ),
      ts_const(
        "MATHML_UNARY_CLASSES", "readonly string[]", data[:unary_classes],
        doc: "`Utility::UNARY_CLASSES`.",
      ),
    ]
    CoreDataGenerator.write_ts(File.join(out_root, "transform-tables.ts"), sections)
  end

  def generator_input_hashes
    GENERATOR_INPUT_PATHS.sort.to_h do |path|
      absolute = File.join(REPO_ROOT, path)
      raise Error, "generator input #{path} is missing" unless File.file?(absolute)

      [path, CorpusGenerator.sha256(File.binread(absolute))]
    end
  end

  def run(argv)
    options = CoreDataGenerator.parse_options(argv, out_default: File.join(REPO_ROOT, OUT_REL))
    if options[:help]
      puts CoreDataGenerator.usage(GENERATOR_PATH)
      return 0
    end

    loaded_gem_dir = CorpusGenerator.loaded_gem_dir
    gem_dir = options[:gem] || loaded_gem_dir
    if options[:gem] && options[:gem] != loaded_gem_dir
      raise Error, "--gem #{options[:gem]} is not the checkout bundler loaded (#{loaded_gem_dir})"
    end
    dirty = CoreDataGenerator.check_checkouts!(gem_dir, options[:out], options[:allow_dirty])

    require "mml"
    data = schema
    transform = transform_data(gem_dir)
    provenance = CoreDataGenerator.build_provenance(
      GENERATOR_PATH, generator_input_hashes, gem_dir, dirty, options[:allow_dirty],
      extra: { "mmlVersion" => Gem.loaded_specs.fetch("mml").version.to_s },
    )
    written = [
      emit_schema_file(options[:out], data),
      emit_transform_file(options[:out], transform),
      CoreDataGenerator.emit_provenance_file(
        options[:out], provenance,
        header_section: CoreDataGenerator.ts_doc(<<~TEXT.chomp),
          GENERATED FILE — do not edit, regenerate.

          Emitted by #{GENERATOR_PATH} from the Plurimath Ruby gem, the oracle
          (ARCHITECTURE.md §1).

          What every file under `#{OUT_REL}/` was generated from. `generatorInputs`
          hashes every Ruby file whose bytes can change the output.
        TEXT
        interface_name: "MmlSchemaGeneratedProvenance",
        const_name: "MML_SCHEMA_GENERATED_PROVENANCE",
      ),
    ]
    written.sort.each { |path| puts "  #{CoreDataGenerator.relative(path)}" }
    puts "classes #{data[:classes].length}, child sets #{data[:child_sets].length} " \
         "(#{data[:child_sets].sum(&:length)} rules)"
    puts "committable: #{provenance['committable']}"
    0
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    exit MathmlDataGenerator.run(ARGV)
  rescue MathmlDataGenerator::Error, CoreDataGenerator::Error, CorpusGenerator::Error => e
    warn "generate-mathml-data: #{e.message}"
    exit 1
  end
end
