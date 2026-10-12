#!/usr/bin/env ruby
# frozen_string_literal: true

# Emits what `Plurimath::Omml::Translator` resolves at runtime through the gem
# beyond what the MathML translator's tables already carry
# (src/formats/mathml/generated/transform-tables.ts, which the OMML translator
# reuses for class facts, `function_from_token` and `Utility::FONT_STYLES`):
# `Utility.symbols_class(..., lang: :omml)`, the names `Omml::Utility.valid_class`
# accepts and the classes `Utility.get_class` reaches for them, and
# `Omml::SUPPORTED_FONTS`.
#
# Usage:
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile mise x -- bundle exec ruby \
#     scripts/generate-omml-data.rb [--gem PATH] [--out DIR] [--allow-dirty]
#
# Writes:
#   src/formats/omml/generated/input-tables.ts  the translator's tables
#   src/formats/omml/generated/provenance.ts    what they were generated from

require_relative "generate-mathml-data"

module OmmlDataGenerator
  class Error < StandardError; end

  REPO_ROOT = File.expand_path("..", __dir__)
  GENERATOR_PATH = "scripts/generate-omml-data.rb"
  OUT_REL = "src/formats/omml/generated"

  GENERATOR_INPUT_PATHS = [
    GENERATOR_PATH,
    MathmlDataGenerator::GENERATOR_PATH,
    CoreDataGenerator::GENERATOR_PATH,
    CorpusGenerator::GENERATOR_PATH,
  ].freeze

  module_function

  def ts_const(...)
    MathmlDataGenerator.ts_const(...)
  end

  def key(klass)
    CorpusGenerator.class_key(klass)
  end

  def symbol_input_rows
    merged = Plurimath::Utility.all_symbols_classes(:omml)
    merged.map do |text, klass|
      raise Error, "all_symbols_classes(:omml) is keyed by #{text.class}" unless text.is_a?(::String)

      [text, CorpusGenerator.symbol_id(klass)]
    end
  end

  # `Omml::Utility.valid_class`: an extractable FontStyle naming one of
  # `SUB_SUP_CLASSES`, or any text LaTeX maps to `:power_base`.
  def sub_sup_classes
    Plurimath::Asciimath::Constants::SUB_SUP_CLASSES.dup
  end

  def power_base_names
    Plurimath::Latex::Constants::SYMBOLS.select { |_, value| value == :power_base }.keys.map(&:to_s).sort
  end

  # `Utility.get_class(name).new(sub, sup)` for every name `valid_class` passes.
  def script_class_rows
    (sub_sup_classes | power_base_names).sort.map do |name|
      klass = begin
        Plurimath::Utility.get_class(name)
      rescue ::NameError
        nil
      end
      next [name, nil] if klass.nil?
      unless MathmlDataGenerator.function_family(klass) == "binary"
        raise Error, "#{key(klass)}: a script class that is not a BinaryFunction"
      end

      instance = klass.new(:one, :two)
      unless instance.instance_variables.sort == %i[@parameter_one @parameter_two]
        raise Error, "#{key(klass)}.new(a, b) assigns #{instance.instance_variables.inspect}"
      end

      [name, key(klass)]
    end
  end

  def supported_font_rows
    Plurimath::Omml::SUPPORTED_FONTS.map { |font, style| [font.to_s, style] }
  end

  def transform_data
    {
      symbol_input: symbol_input_rows,
      sub_sup_classes: sub_sup_classes,
      power_base_names: power_base_names,
      script_classes: script_class_rows,
      supported_fonts: supported_font_rows,
    }
  end

  def emit_tables_file(out_root, data)
    sections = [
      CoreDataGenerator.ts_doc(<<~TEXT.chomp),
        GENERATED FILE — do not edit, regenerate.

        Emitted by #{GENERATOR_PATH} from the Plurimath Ruby gem, the oracle
        (ARCHITECTURE.md §1). What it was generated from is in
        `#{OUT_REL}/provenance.ts`.

        What `Plurimath::Omml::Translator` resolves through the gem at runtime that
        the MathML translator's tables do not already carry.
      TEXT
      CoreDataGenerator.ts_tuple_map(
        "OMML_SYMBOL_CLASS_INPUT", "ReadonlyMap<string, string>", data[:symbol_input],
        doc: "`Utility.all_symbols_classes(:omml)`: stripped text -> symbol id.",
      ),
      ts_const(
        "OMML_SUB_SUP_CLASSES", "readonly string[]", data[:sub_sup_classes],
        doc: "`Asciimath::Constants::SUB_SUP_CLASSES`.",
      ),
      ts_const(
        "OMML_POWER_BASE_NAMES", "readonly string[]", data[:power_base_names],
        doc: "The `Latex::Constants::SYMBOLS` keys whose value is `:power_base`.",
      ),
      ts_const(
        "OMML_SCRIPT_CLASSES", "readonly (readonly [string, string | null])[]", data[:script_classes],
        doc: "Each name `valid_class` accepts and the binary class `Utility.get_class` reaches\n" \
             "(null where the gem raises NameError).",
      ),
      CoreDataGenerator.ts_tuple_map(
        "OMML_SUPPORTED_FONTS", "ReadonlyMap<string, string>", data[:supported_fonts],
        doc: "`Omml::SUPPORTED_FONTS`: `scr`-`sty` key -> `Utility::FONT_STYLES` key.",
      ),
    ]
    CoreDataGenerator.write_ts(File.join(out_root, "input-tables.ts"), sections)
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

    CorpusGenerator.load_model_classes!(gem_dir)
    data = transform_data
    provenance = CoreDataGenerator.build_provenance(
      GENERATOR_PATH, generator_input_hashes, gem_dir, dirty, options[:allow_dirty],
    )
    written = [
      emit_tables_file(options[:out], data),
      CoreDataGenerator.emit_provenance_file(
        options[:out], provenance,
        header_section: CoreDataGenerator.ts_doc(<<~TEXT.chomp),
          GENERATED FILE — do not edit, regenerate.

          Emitted by #{GENERATOR_PATH} from the Plurimath Ruby gem, the oracle
          (ARCHITECTURE.md §1).

          What every file under `#{OUT_REL}/` was generated from. `generatorInputs`
          hashes every Ruby file whose bytes can change the output.
        TEXT
        interface_name: "OmmlDataGeneratedProvenance",
        const_name: "OMML_DATA_GENERATED_PROVENANCE",
      ),
    ]
    written.sort.each { |path| puts "  #{CoreDataGenerator.relative(path)}" }
    puts "symbol inputs #{data[:symbol_input].length}, script classes #{data[:script_classes].length}"
    puts "committable: #{provenance['committable']}"
    0
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    exit OmmlDataGenerator.run(ARGV)
  rescue OmmlDataGenerator::Error, MathmlDataGenerator::Error, CoreDataGenerator::Error,
         CorpusGenerator::Error => e
    warn "generate-omml-data: #{e.message}"
    exit 1
  end
end
