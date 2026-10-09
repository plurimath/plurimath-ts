#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits the `Mml::V4` class schema the MathML element layer builds its tree
# from: for every class reachable from `Mml::V4::Math`, how `Mml.parse` maps an
# XML element onto it.
#
# Usage:
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-mml-schema.rb [--gem PATH] [--out DIR] [--allow-dirty]
#
# Writes:
#   src/formats/mathml/generated/mml-schema.ts  the class schema
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
# Classes are named by their `Mml::V4::` suffix. The output is deterministic.

require_relative "generate-core-data"

module MmlSchemaGenerator
  class Error < StandardError; end

  REPO_ROOT = File.expand_path("..", __dir__)
  GENERATOR_PATH = "scripts/generate-mml-schema.rb"
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
    provenance = CoreDataGenerator.build_provenance(
      GENERATOR_PATH, generator_input_hashes, gem_dir, dirty, options[:allow_dirty],
      extra: { "mmlVersion" => Gem.loaded_specs.fetch("mml").version.to_s },
    )
    written = [
      emit_schema_file(options[:out], data),
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
    exit MmlSchemaGenerator.run(ARGV)
  rescue MmlSchemaGenerator::Error, CoreDataGenerator::Error, CorpusGenerator::Error => e
    warn "generate-mml-schema: #{e.message}"
    exit 1
  end
end
