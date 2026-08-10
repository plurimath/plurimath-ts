# frozen_string_literal: true

# Generates the data `src/formatting/` owns: the locale -> decimal-marker
# table and the default marker that `locales.ts` serves (ARCHITECTURE.md §3
# rules 1-2 — a leaf service's generated data, under its own directory, is
# part of the leaf service).
#
# The source is the gem's `Formatter::SupportedLocales::LOCALES`, read through
# the **loaded runtime** — never off the source text — because for this table
# the constant is the behaviour: `decimal_for` is a straight fetch from it,
# and `Configuration#decimal` is what the AsciiMath grammar reads
# (`asciimath/parse.rb:204`, used at :18 and :86). Reading it is still not
# trusting it: every entry is verified with live calls before emission —
#
#   1. `decimal_for` answers the same marker for the Symbol and the String
#      spelling of the key (the port's keys are strings);
#   2. `Math.parse("1<marker>5", :asciimath, locale:)` reads a single Number
#      under the entry's own marker;
#   3. the same parse under each *other* marker the table holds does not —
#      which is the behaviour the marker exists to switch.
#
# The `group` column is deliberately not emitted: nothing at parse time reads
# it, and the P4 `Formatter::Numbers` port owns that surface (§9, §10). When
# P4 arrives this generator grows the column; until then emitting it would be
# dead weight in every parser bundle.
#
# Usage, from the plurimath-ts repository root:
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile \
#     mise x -- bundle exec ruby scripts/generate-formatting-data.rb
#
# Options:
#   --gem PATH        gem checkout to treat as the oracle
#                     (default: the checkout bundler resolved `plurimath` from)
#   --out PATH        output root (default: <repo>/src/formatting/generated)
#   --allow-dirty     generate from a dirty checkout; the output is marked
#                     non-committable in the provenance file (§7)
#   --help
#
# Outputs:
#   src/formatting/generated/locale-decimals.ts  locale key -> decimal marker
#   src/formatting/generated/provenance.ts       what the table was generated from
#
# The generator is deterministic: two runs over the same oracle produce
# byte-identical output. No timestamps, no absolute paths; the table keeps the
# gem's declaration order because that order is data — it is what makes drift
# against a gem bump a straight diff.

require_relative "generate-core-data"

module FormattingDataGenerator
  class Error < StandardError; end

  REPO_ROOT = File.expand_path("..", __dir__)
  GENERATOR_PATH = "scripts/generate-formatting-data.rb"
  OUT_REL = "src/formatting/generated"

  # Every file whose bytes can change what this generator emits: itself, the
  # core-data generator it borrows the TypeScript emission and provenance
  # helpers from, and the corpus generator that file in turn borrows git and
  # hashing helpers from. All three are hashed into the provenance file, for
  # the reason `generate-core-data.rb` states: hashing only the entry point
  # would let a change to a shared file move the table while the recorded hash
  # stayed identical.
  GENERATOR_INPUT_PATHS = [
    GENERATOR_PATH,
    CoreDataGenerator::GENERATOR_PATH,
    CorpusGenerator::GENERATOR_PATH,
  ].freeze

  # `decimal_for` takes its fallback as a parameter; this one can never
  # collide with a real marker, so a row missing its `:decimal` key is caught
  # rather than emitted as the fallback.
  MISSING = Object.new

  module_function

  # --- measurement ---------------------------------------------------------

  def supported_locales
    Plurimath::Formatter::SupportedLocales
  end

  # The gem's keys are Symbols (`:"sr-Cyrl-ME"`, `:fil`); the port's are their
  # String forms. `key_for` accepts both spellings (`locale.to_sym` fallback),
  # so the projection is sound only while both resolve to the same marker —
  # asserted per entry, not assumed.
  def measured_marker(key)
    marker = supported_locales.decimal_for(key, default: MISSING)
    if marker.equal?(MISSING) || !marker.is_a?(::String) || marker.empty?
      raise Error, "#{key.inspect}: decimal_for answered #{marker.inspect}, not a marker"
    end

    as_string = supported_locales.decimal_for(key.to_s, default: MISSING)
    unless as_string == marker
      raise Error, "#{key.inspect}: the String spelling resolves to " \
                   "#{as_string.inspect}, the Symbol spelling to #{marker.inspect}"
    end

    marker
  end

  # `Formula#value` with exactly one `Math::Number` node -> its text, anything
  # else -> nil. No rescue: every probed input parses without raising (even an
  # out-of-locale U+066B becomes a generic `Symbols::Symbol`), so an exception
  # here is a behaviour change to investigate, not a shape to classify.
  def parsed_single_number(text, locale)
    formula =
      if locale.nil?
        Plurimath::Math.parse(text, :asciimath)
      else
        Plurimath::Math.parse(text, :asciimath, locale: locale)
      end
    nodes = formula.value
    return nil unless nodes.is_a?(::Array) && nodes.length == 1

    node = nodes.first
    node.value if node.instance_of?(Plurimath::Math::Number)
  end

  # The behaviour the marker exists to switch (module doc in
  # src/formatting/locales.ts): under its own marker `1<marker>5` is one
  # number; under every other marker the table holds, it is not.
  def verify_entry!(locale, marker, all_markers)
    own = "1#{marker}5"
    unless parsed_single_number(own, locale) == own
      raise Error, "#{locale}: parse(#{own.inspect}) did not read one Number " \
                   "#{own.inspect} — decimal_for and the grammar disagree"
    end

    (all_markers - [marker]).each do |other|
      text = "1#{other}5"
      next unless parsed_single_number(text, locale) == text

      raise Error, "#{locale}: also reads #{text.inspect} as one Number, so " \
                   "#{other.inspect} acts as a second decimal marker"
    end
  end

  def locale_rows
    keys = supported_locales::LOCALES.keys
    raise Error, "the gem's locale table is empty" if keys.empty?

    unless keys.all?(::Symbol)
      raise Error, "the gem's locale keys are no longer Symbols"
    end

    rows = keys.map { |key| [key.to_s, measured_marker(key)] }
    locales = rows.map(&:first)
    unless locales.uniq.length == locales.length
      raise Error, "duplicate locale keys after String projection: " \
                   "#{locales.tally.select { |_, n| n > 1 }.keys.join(', ')}"
    end

    markers = rows.map(&:last).uniq
    rows.each { |locale, marker| verify_entry!(locale, marker, markers) }
    rows
  end

  # `Configuration::DEFAULT_DECIMAL` is what a fresh configuration serves and
  # what a locale-less parse reads — both verified, since the constant alone
  # proves neither.
  def measured_default_marker
    declared = Plurimath::Configuration::DEFAULT_DECIMAL
    unless declared.is_a?(::String) && !declared.empty?
      raise Error, "DEFAULT_DECIMAL is #{declared.inspect}, not a marker"
    end

    fresh = Plurimath::Configuration.new.decimal
    unless fresh == declared
      raise Error, "a fresh Configuration#decimal is #{fresh.inspect}, " \
                   "not DEFAULT_DECIMAL #{declared.inspect}"
    end

    own = "1#{declared}5"
    unless parsed_single_number(own, nil) == own
      raise Error, "a locale-less parse(#{own.inspect}) did not read one Number"
    end

    declared
  end

  # --- payloads ------------------------------------------------------------

  def ts_header(description)
    CoreDataGenerator.ts_doc(<<~TEXT.chomp)
      GENERATED FILE — do not edit, regenerate.

      Emitted by #{GENERATOR_PATH} from the Plurimath Ruby gem, the oracle
      (ARCHITECTURE.md §1).
      What it was generated from is in `#{OUT_REL}/provenance.ts`.

      #{description}
    TEXT
  end

  def emit_locale_decimals_file(out_root, default_marker, rows)
    marker_count = rows.map(&:last).uniq.length
    tuple_lines = rows.map do |locale, marker|
      "  [#{CoreDataGenerator.ts_string(locale)}, #{CoreDataGenerator.ts_string(marker)}],"
    end
    sections = [
      ts_header(<<~TEXT.chomp),
        `Formatter::SupportedLocales::LOCALES`, projected onto its `decimal`
        column, in the gem's declaration order — drift against a gem bump is a
        straight diff. Read through the loaded gem, never off the source text,
        and verified entry by entry before emission: `decimal_for` answers the
        same marker for the Symbol and the String spelling of every key, and a
        live `Math.parse` reads `1<marker>5` as a single Number under the
        entry's own locale while refusing to under each of the other markers
        the table holds.

        The `group` column is not carried: nothing at parse time reads it, and
        the P4 `Formatter::Numbers` port owns that surface (ARCHITECTURE.md §9).
      TEXT
      [
        CoreDataGenerator.ts_doc(
          "Ruby: `Plurimath::Configuration::DEFAULT_DECIMAL` — verified as what a\n" \
          "fresh `Configuration#decimal` serves and what a locale-less parse reads.",
        ),
        "export const DEFAULT_DECIMAL_MARKER = " \
        "#{CoreDataGenerator.ts_string(default_marker)};",
      ].join("\n"),
      [
        CoreDataGenerator.ts_doc(
          "Locale key -> decimal marker: #{rows.length} entries, #{marker_count} distinct\n" \
          "markers. `as const`, because `LocaleKey` — the closed union\n" \
          "`src/formatting/locales.ts` exports — is derived from these tuples' literal\n" \
          "types; a widened `string[][]` would silently reopen it.",
        ),
        "export const LOCALE_DECIMAL_MARKERS = [",
        *tuple_lines,
        "] as const;",
      ].join("\n"),
    ]
    CoreDataGenerator.write_ts(File.join(out_root, "locale-decimals.ts"), sections)
  end

  def emit_provenance_file(out_root, provenance)
    sections = [
      CoreDataGenerator.ts_doc(<<~TEXT.chomp),
        GENERATED FILE — do not edit, regenerate.

        Emitted by #{GENERATOR_PATH} from the Plurimath Ruby gem, the oracle
        (ARCHITECTURE.md §1).

        What every file under `#{OUT_REL}/` was generated from.

        Separate from the core and format provenance files because a separate
        generator wrote it: the formatting leaf service owns its own data (§3
        rules 1-2), and each generator records its own inputs (§7).

        `generator` names the script that was run; `generatorInputs` hashes every
        Ruby file whose bytes can change the table, keyed by its
        repository-relative path — that script, plus the two generators it
        borrows emission, git and hashing helpers from. Hashing only the entry
        point would let a change to a shared file move the table while the
        recorded hash stayed identical.

        Otherwise deliberately path-free: dirty file lists would churn on every
        unrelated edit.
      TEXT
      [
        "export interface FormattingGeneratedProvenance {",
        *provenance.map do |key, value|
          "  readonly #{key}: #{CoreDataGenerator.provenance_type(value)};"
        end,
        "}",
      ].join("\n"),
      [
        CoreDataGenerator.ts_doc(
          "`committable: false` marks output generated from a dirty checkout —\n" \
          "useful while iterating, never to be committed (§7).",
        ),
        "export const FORMATTING_GENERATED_PROVENANCE: FormattingGeneratedProvenance = {",
        *provenance.flat_map { |key, value| CoreDataGenerator.provenance_entry(key, value) },
        "};",
      ].join("\n"),
    ]
    CoreDataGenerator.write_ts(File.join(out_root, "provenance.ts"), sections)
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

  def relative(path)
    File.expand_path(path).delete_prefix("#{REPO_ROOT}/")
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
    {
      "generator" => GENERATOR_PATH,
      "generatorInputs" => generator_input_hashes,
      "oracle" => "plurimath",
      "oracleVersion" => gem_spec.version.to_s,
      "oracleCommit" => CorpusGenerator.git(gem_dir, "rev-parse", "HEAD").strip,
      "oracleClean" => dirty["gem"].empty?,
      "generatorClean" => dirty["generator"].empty?,
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

    loaded_gem_dir = CorpusGenerator.loaded_gem_dir
    gem_dir = options[:gem] || loaded_gem_dir
    if options[:gem] && options[:gem] != loaded_gem_dir
      raise Error, <<~MESSAGE
        --gem #{options[:gem]} is not the checkout bundler loaded
        (#{loaded_gem_dir}). Point BUNDLE_GEMFILE at the same checkout, so the
        recorded provenance describes the code that actually ran.
      MESSAGE
    end
    dirty = check_checkouts!(gem_dir, options[:out], options[:allow_dirty])

    default_marker = measured_default_marker
    rows = locale_rows
    provenance = build_provenance(gem_dir, dirty, options[:allow_dirty])

    written = [
      emit_locale_decimals_file(options[:out], default_marker, rows),
      emit_provenance_file(options[:out], provenance),
    ]
    written.sort.each { |path| puts "  #{relative(path)}" }
    puts "#{rows.length} locales, #{rows.map(&:last).uniq.length} distinct markers, " \
         "default #{default_marker.inspect}; every entry verified by parse"
    puts "committable: #{provenance['committable']}"
    0
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    exit FormattingDataGenerator.run(ARGV)
  rescue FormattingDataGenerator::Error, CoreDataGenerator::Error, CorpusGenerator::Error => e
    warn "generate-formatting-data: #{e.message}"
    exit 1
  end
end
