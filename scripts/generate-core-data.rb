# frozen_string_literal: true

# Generates the data `src/core/` owns: the two tables Ruby's
# `Symbols::Symbol#==` needs to answer `comparable_value` (ARCHITECTURE.md §5,
# equality projection).
#
#   comparable_value(symbol) = normalize_value(symbol.value ||
#                                              symbol.default_value_for_comparison)
#   normalize_value(raw)     = Utility.html_entity_to_unicode(raw.to_s)
#
# Two tables fall out of that, and neither can be written by hand:
#
#   1. the entity table `Utility.html_entity_to_unicode` decodes with — the
#      htmlentities gem at its DEFAULT flavour, `xhtml1`, 253 named entities.
#      A JavaScript entity library is the wrong source: `he` and `entities`
#      implement the larger HTML5 set and decode `&half;`/`&sung;`, which the
#      gem leaves untouched.
#   2. the canonical fallback each symbol class uses when its `value` is nil,
#      which is `to_unicodemath` — measured per class, never read off the
#      source, because `initialize` and `to_unicodemath` are full of guards.
#
# Layer rules: this output is core's own data, under core's own directory, so
# reading it is not a cross-layer import (ARCHITECTURE.md §3 rule 1). It is a
# separate generator from scripts/generate-corpus.rb because the two own
# different directories: `src/generated/` is format-owned and layer 1 may not
# import it, and each generator records its own provenance. This one reuses the
# corpus generator's class discovery, symbol ids and hashing, so what it emits
# depends on both files and its provenance hashes both (`generatorInputs`).
#
# Usage, from the plurimath-ts repository root:
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile \
#     mise x -- bundle exec ruby scripts/generate-core-data.rb
#
# Options:
#   --gem PATH        gem checkout to treat as the oracle
#                     (default: the checkout bundler resolved `plurimath` from)
#   --out PATH        output root (default: <repo>/src/core/generated)
#   --allow-dirty     generate from a dirty checkout; the output is marked
#                     non-committable in the provenance file (§7)
#   --help
#
# Outputs:
#   src/core/generated/html-entities.ts    entity name -> codepoint (xhtml1)
#   src/core/generated/symbol-canonical.ts symbol id -> canonical value
#   src/core/generated/provenance.ts       what the tables were generated from
#
# The generator is deterministic: two runs over the same oracle produce
# byte-identical output. No timestamps, no absolute paths, sorted keys.

require_relative "generate-corpus"
require "htmlentities"

module CoreDataGenerator
  class Error < StandardError; end

  REPO_ROOT = File.expand_path("..", __dir__)
  GENERATOR_PATH = "scripts/generate-core-data.rb"
  OUT_REL = "src/core/generated"

  # Every file whose bytes can change what this generator emits: itself, and
  # the corpus generator it borrows class discovery, symbol ids and hashing
  # from. Both are hashed into the provenance file, because hashing only the
  # entry point would let a change to the shared file move the tables while the
  # recorded hash stayed identical — provenance naming a generator that can no
  # longer reproduce its own output.
  GENERATOR_INPUT_PATHS = [GENERATOR_PATH, CorpusGenerator::GENERATOR_PATH].freeze

  # `HTMLEntities.new` takes no flavour argument in `Utility::HTML_ENTITIES`,
  # so the gem decodes with the library default. Named, not assumed: the
  # generator asserts the default still is this before emitting.
  ENTITY_FLAVOUR = "xhtml1"

  # Biome's print width, as in the corpus generator: emitted lines must already
  # be what Biome would print, or `pnpm lint` fails on generated output.
  TS_PRINT_WIDTH = 100

  # Instance state `Symbol#to_unicodemath` reads. Every symbol class is probed
  # across these so a canonical value that secretly depends on the node is
  # caught here rather than shipped as a wrong constant.
  CANONICAL_PROBES = {
    "bare" => ->(klass) { klass.new },
    "slashed" => ->(klass) { klass.new(nil, true) },
    "mini_sub_sized" => ->(klass) { klass.new(nil, nil, mini_sub_sized: true) },
    "mini_sup_sized" => ->(klass) { klass.new(nil, nil, mini_sup_sized: true) },
    "options" => ->(klass) { klass.new(nil, nil, options: { rspace: "thickmathspace" }) },
  }.freeze

  # Characters that must never reach a source file as themselves: control,
  # format and combining characters, and every space but U+0020. Some symbol
  # classes render to an invisible character and others to a combining mark; the
  # exact counts are not carried here because they are not re-derived on each
  # run. A raw one in a `.ts` file is unreviewable — this repository has already
  # lost time to invisible bytes in source.
  UNSAFE_IN_SOURCE = /[[:cntrl:]\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Mn}\p{Me}\p{Mc}\p{Zs}\p{Zl}\p{Zp}]/

  module_function

  # --- measurement ---------------------------------------------------------

  def entity_table
    unless HTMLEntities.new.instance_variable_get(:@flavor) == ENTITY_FLAVOUR
      raise Error, "htmlentities' default flavour is no longer #{ENTITY_FLAVOUR}"
    end

    table = HTMLEntities::MAPPINGS.fetch(ENTITY_FLAVOUR)
    unless table.values.all? { |value| value.is_a?(::Integer) && value.between?(0, 0x10ffff) }
      raise Error, "the #{ENTITY_FLAVOUR} mapping is no longer name -> codepoint"
    end

    table.keys.sort.map { |name| [name, table.fetch(name)] }
  end

  # `default_value_for_comparison` is private, and deliberately called through
  # `send` here for the same reason Ruby's own `comparable_value` does.
  def canonical_value(klass, build)
    build.call(klass).send(:default_value_for_comparison)
  rescue ::StandardError => e
    "#{e.class}: #{e.message}"
  end

  def symbol_canonical_values
    classes = [CorpusGenerator.symbol_root] + CorpusGenerator.symbol_classes
    stable = []
    without = []

    classes.each do |klass|
      id = CorpusGenerator.symbol_id(klass)
      measured = CANONICAL_PROBES.transform_values { |build| canonical_value(klass, build) }
      bare = measured.fetch("bare")
      varies = measured.reject { |name, _| name == "bare" }.select { |_, value| value != bare }

      if bare.nil?
        # No fallback at all: `Symbols::Symbol` short-circuits on
        # `instance_of?(Symbol)`, and the abstract `Paren` root inherits a
        # `to_unicodemath` that returns the (nil) value.
        without << id
        next
      end

      unless bare.is_a?(::String)
        raise Error, "#{id}'s canonical value is #{bare.inspect}, not a string"
      end

      unless varies.empty?
        raise Error, <<~MESSAGE
          #{id}'s canonical value depends on instance state, so it cannot be a
          constant in a per-id table: #{varies.map { |k, v| "#{k}=>#{v.inspect}" }.join(', ')}
          (bare: #{bare.inspect}). Decide where that belongs before the table
          claims to be complete (ARCHITECTURE.md §5).
        MESSAGE
      end

      stable << [id, bare]
    end

    { "values" => stable.sort_by(&:first), "without" => without.sort }
  end

  # --- TypeScript emission -------------------------------------------------

  # Biome's string rule: the configured quote wins unless the other one needs
  # fewer escapes. Characters unsafe in source are escaped rather than emitted.
  def ts_string(value)
    unless value.is_a?(::String)
      raise Error, "cannot emit #{value.class} as a TypeScript string"
    end

    quote = value.count('"') > value.count("'") ? "'" : '"'
    body = value.each_char.map { |char| ts_char(char, quote) }.join
    "#{quote}#{body}#{quote}"
  end

  def ts_char(char, quote)
    return "\\\\" if char == "\\"
    return "\\#{quote}" if char == quote
    return char if char == " " || !char.match?(UNSAFE_IN_SOURCE)

    char.codepoints.map { |cp| format("\\u%04x", cp) }.join
  end

  def ts_flat(value)
    case value
    when nil then "null"
    when true, false, ::Integer then value.to_s
    when ::String then ts_string(value)
    when ::Array then "[#{value.map { |item| ts_flat(item) }.join(', ')}]"
    else raise Error, "cannot emit #{value.class} as TypeScript"
    end
  end

  # Biome collapses an array that fits its print width and expands one that
  # does not, so the emitter makes the same decision and `assert_ts_width!`
  # catches a miss.
  def ts_value(value, indent, column = indent * 2)
    flat = ts_flat(value)
    # `+ 1` leaves room for the `,` or `;` Biome prints after the value.
    return flat if column + flat.length + 1 <= TS_PRINT_WIDTH
    return flat unless value.is_a?(::Array) && !value.empty?

    pad = "  " * indent
    lines = value.map { |item| "#{pad}  #{ts_value(item, indent + 1)}," }
    (["["] + lines + ["#{pad}]"]).join("\n")
  end

  def ts_doc(text)
    ["/**", *text.split("\n").map { |line| line.empty? ? " *" : " * #{line}" }, " */"].join("\n")
  end

  def ts_const(name, type, value, doc: nil)
    prefix = "export const #{name}: #{type} = "
    [doc && ts_doc(doc), "#{prefix}#{ts_value(value, 0, prefix.length)};"].compact.join("\n")
  end

  # One line per entry, which is what Biome prints for an array of tuples that
  # each fit. Tuples, not object keys: Biome's formatter unquotes a PascalCase
  # key and `useNamingConvention` then rejects it, so a keyed object literal
  # cannot be both formatted and linted here.
  def ts_tuple_map(name, type, entries, doc: nil)
    lines = entries.map { |key, value| "  [#{ts_string(key)}, #{ts_flat(value)}]," }
    [doc && ts_doc(doc), "export const #{name}: #{type} = new Map([", *lines, "]);"]
      .compact.join("\n")
  end

  def ts_header(description, provenance: true, source: "the Plurimath Ruby gem, the oracle")
    pointer = provenance ? "\nWhat it was generated from is in `#{OUT_REL}/provenance.ts`." : ""
    ts_doc(<<~TEXT.chomp)
      GENERATED FILE — do not edit, regenerate.

      Emitted by #{GENERATOR_PATH} from #{source}
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

  def assert_safe_characters!(path, body)
    offenders = body.each_char.reject { |char| [" ", "\n"].include?(char) }
      .select { |char| char.match?(UNSAFE_IN_SOURCE) }
    return if offenders.empty?

    codepoints = offenders.uniq.map { |char| format("U+%04X", char.ord) }.join(", ")
    raise Error, "#{path} carries #{offenders.length} unsafe character(s): #{codepoints}"
  end

  def write_ts(path, sections)
    body = "#{sections.join("\n\n")}\n"
    assert_ts_width!(path, body)
    assert_safe_characters!(path, body)
    FileUtils.mkdir_p(File.dirname(path))
    File.binwrite(path, body)
    path
  end

  # --- payloads ------------------------------------------------------------

  def emit_html_entities_file(out_root, entities)
    sections = [
      ts_header(<<~TEXT.chomp, source: "the htmlentities gem the oracle decodes with"),
        `HTMLEntities::MAPPINGS["#{ENTITY_FLAVOUR}"]`, verbatim: entity name -> codepoint.

        `Plurimath::Utility.html_entity_to_unicode` — which `Symbols::Symbol#==`
        normalizes both sides through — decodes with `HTMLEntities.new`, and that
        constructor's default flavour is `#{ENTITY_FLAVOUR}`. Neither the larger
        `expanded` set nor a JavaScript entity library would agree with it: both
        decode entities (`&half;`, `&sung;`) the gem leaves as written.

        Codepoints rather than the characters themselves, because that is the
        shape the gem's own table has (`codepoint.chr(Encoding::UTF_8)` is how it
        decodes) and because it keeps zero-width and combining characters out of
        this file.
      TEXT
      ts_const("XHTML1_ENTITY_COUNT", "number", entities.length,
               doc: "How many entities the table must hold. The suite checks the map against it,\n" \
                    "so a truncated regeneration fails instead of silently decoding less."),
      ts_tuple_map(
        "XHTML1_ENTITY_CODEPOINTS",
        "ReadonlyMap<string, number>",
        entities,
        doc: "Entity name (no `&`, no `;`) -> Unicode codepoint. Lookup is\n" \
             "case-sensitive, exactly as the gem's is: its decoder matches names\n" \
             "case-insensitively but looks them up verbatim, so `&Pi;` decodes and\n" \
             "`&PI;` does not.",
      ),
    ]
    write_ts(File.join(out_root, "html-entities.ts"), sections)
  end

  def emit_symbol_canonical_file(out_root, canonical)
    values = canonical.fetch("values")
    without = canonical.fetch("without")
    sections = [
      ts_header(<<~TEXT.chomp),
        Symbol id -> the value `Symbols::Symbol#==` falls back to when the node's
        own `value` is nil.

        That fallback is Ruby's `default_value_for_comparison`, which is
        `to_unicodemath` for a concrete symbol class and nil for the abstract
        `Symbols::Symbol` itself (`return if instance_of?(Symbol)`). It is read at
        *comparison* time, never materialized into a node: `Symbol.new` genuinely
        stores nil in `@value`, and filling it in at construction would make the
        normalized model disagree with the gem's.

        Measured, not read: every class is instantiated and asked. The generator
        also probes `slashed` and the two mini-sizing flags, and refuses to emit a
        class whose fallback turns out to depend on them.
      TEXT
      ts_const(
        "SYMBOLS_WITHOUT_CANONICAL_VALUE",
        "readonly string[]",
        without,
        doc: "The #{without.length} classes with no fallback at all, measured the same way.\n" \
             "`Symbol` is the base class Ruby short-circuits on; `Paren` is the abstract\n" \
             "paren root, which inherits a `to_unicodemath` that returns its own (nil)\n" \
             "value. A symbol carrying either id compares on `value` alone, so two of\n" \
             "them with no value are equal and one with a value is not.",
      ),
      ts_tuple_map(
        "SYMBOL_CANONICAL_VALUES",
        "ReadonlyMap<string, string>",
        values,
        doc: "#{values.length} classes. An id missing here has no fallback — which is\n" \
             "also the answer for an id the gem does not have. Values are emitted exactly\n" \
             "as `to_unicodemath` returns them, with invisible and combining characters\n" \
             "escaped; entity decoding still runs over them at comparison time, as\n" \
             "`normalize_value` does.",
      ),
    ]
    write_ts(File.join(out_root, "symbol-canonical.ts"), sections)
  end

  # A hash becomes a `Map` for the same reason the tables do: its keys are
  # file paths, and a keyed object literal of those cannot be both
  # Biome-formatted and Biome-linted here.
  def provenance_type(value)
    return "boolean" if [true, false].include?(value)
    return "ReadonlyMap<string, string>" if value.is_a?(::Hash)

    "string"
  end

  def provenance_entry(key, value)
    return ["  #{key}: #{ts_flat(value)},"] unless value.is_a?(::Hash)

    # A path plus a 64-character hash does not fit Biome's print width on one
    # line, so each tuple is emitted expanded — which is what Biome prints.
    ["  #{key}: new Map([", *value.map { |k, v| "    #{ts_value([k, v], 2)}," }, "  ]),"]
  end

  def emit_provenance_file(out_root, provenance)
    sections = [
      ts_header(<<~TEXT.chomp, provenance: false),
        What every file under `#{OUT_REL}/` was generated from.

        Separate from `src/generated/provenance.ts` because a separate generator
        wrote it: layer 1 may not import format-owned data, and each generator
        records its own inputs (§7).

        `generator` names the script that was run; `generatorInputs` hashes every
        Ruby file whose bytes can change these tables, keyed by its
        repository-relative path — that script, plus the corpus generator it
        borrows class discovery, symbol ids and hashing from. Hashing only the
        entry point would let a change to the shared file move the tables while
        the recorded hash stayed identical.

        Otherwise deliberately path-free: dirty file lists would churn on every
        unrelated edit.
      TEXT
      [
        "export interface CoreGeneratedProvenance {",
        *provenance.map { |key, value| "  readonly #{key}: #{provenance_type(value)};" },
        "}",
      ].join("\n"),
      # One key per line, which is what Biome prints for an object literal that
      # has a newline after its `{`.
      [
        ts_doc("`committable: false` marks output generated from a dirty checkout —\n" \
               "useful while iterating, never to be committed (§7)."),
        "export const CORE_GENERATED_PROVENANCE: CoreGeneratedProvenance = {",
        *provenance.flat_map { |key, value| provenance_entry(key, value) },
        "};",
      ].join("\n"),
    ]
    write_ts(File.join(out_root, "provenance.ts"), sections)
  end

  # --- driver --------------------------------------------------------------

  def parse_options(argv)
    options = { gem: nil, out: File.join(REPO_ROOT, OUT_REL), allow_dirty: false }
    until argv.empty?
      case (arg = argv.shift)
      when "--gem" then options[:gem] = File.expand_path(argv.shift.to_s)
      when "--out" then options[:out] = File.expand_path(argv.shift.to_s)
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

  def check_checkouts!(gem_dir, out_root, allow_dirty)
    unless CorpusGenerator.git_repository?(gem_dir)
      raise Error, "#{gem_dir} is not a git checkout; the oracle must be one (§7)"
    end

    gem_dirty = CorpusGenerator.dirty_paths(gem_dir)
    repo_dirty = CorpusGenerator.dirty_paths(REPO_ROOT, except: [relative(out_root)])

    if !allow_dirty && !(gem_dirty.empty? && repo_dirty.empty?)
      raise Error, <<~MESSAGE
        Refusing to generate from a dirty checkout (ARCHITECTURE.md §7).
          gem       #{gem_dir}: #{gem_dirty.empty? ? 'clean' : gem_dirty.join(', ')}
          generator #{REPO_ROOT}: #{repo_dirty.empty? ? 'clean' : repo_dirty.join(', ')}
        Commit or stash, or pass --allow-dirty to produce non-committable output.
      MESSAGE
    end

    { "gem" => gem_dirty, "generator" => repo_dirty }
  end

  def relative(path)
    File.expand_path(path).delete_prefix("#{REPO_ROOT}/")
  end

  # Sorted by path, so adding an input cannot reorder the emitted file.
  def generator_input_hashes
    GENERATOR_INPUT_PATHS.sort.to_h do |path|
      absolute = File.join(REPO_ROOT, path)
      raise Error, "generator input #{path} is missing" unless File.file?(absolute)

      [path, CorpusGenerator.sha256(File.binread(absolute))]
    end
  end

  def build_provenance(gem_dir, dirty, allow_dirty)
    gem_spec = Gem.loaded_specs.fetch("plurimath")
    entities_spec = Gem.loaded_specs.fetch("htmlentities")
    {
      "generator" => GENERATOR_PATH,
      "generatorInputs" => generator_input_hashes,
      "oracle" => "plurimath",
      "oracleVersion" => gem_spec.version.to_s,
      "oracleCommit" => CorpusGenerator.git(gem_dir, "rev-parse", "HEAD").strip,
      "oracleClean" => dirty["gem"].empty?,
      "generatorClean" => dirty["generator"].empty?,
      "entityLibrary" => "htmlentities",
      "entityLibraryVersion" => entities_spec.version.to_s,
      "entityFlavour" => ENTITY_FLAVOUR,
      "rubyEngine" => RUBY_ENGINE,
      "rubyVersion" => RUBY_VERSION,
      "committable" => dirty["gem"].empty? && dirty["generator"].empty? && !allow_dirty,
    }
  end

  def run(argv)
    options = parse_options(argv)
    if options[:help]
      puts usage
      return 0
    end

    gem_dir = options[:gem] || CorpusGenerator.loaded_gem_dir
    dirty = check_checkouts!(gem_dir, options[:out], options[:allow_dirty])
    CorpusGenerator.load_model_classes!(gem_dir)

    entities = entity_table
    canonical = symbol_canonical_values
    provenance = build_provenance(gem_dir, dirty, options[:allow_dirty])

    written = [
      emit_html_entities_file(options[:out], entities),
      emit_symbol_canonical_file(options[:out], canonical),
      emit_provenance_file(options[:out], provenance),
    ]
    written.sort.each { |path| puts "  #{relative(path)}" }
    puts "#{entities.length} #{ENTITY_FLAVOUR} entities; " \
         "#{canonical['values'].length} canonical symbol values, " \
         "#{canonical['without'].length} without (#{canonical['without'].join(', ')})"
    puts "committable: #{provenance['committable']}"
    0
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    exit CoreDataGenerator.run(ARGV)
  rescue CoreDataGenerator::Error, CorpusGenerator::Error => e
    warn "generate-core-data: #{e.message}"
    exit 1
  end
end
