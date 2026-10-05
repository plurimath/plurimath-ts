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
# The `group` column IS emitted, alongside `decimal` — this is the P4
# `Formatter::Numbers` port's number-rendering slice (§9, §10) that the
# `decimal`-only version of this comment used to defer. Nothing at PARSE time
# reads `group` (only `decimal` feeds the AsciiMath grammar, as above), so it
# has no read-back-by-parse verification to reuse; it is verified instead by a
# live RENDER call — see `measured_group` and `verify_group_entry!` below.
# `Formatter::Standard`, the gem's public number-formatter class, cannot be
# that live call: measured on the oracle, `Formatter::Standard.new(locale:
# "de").localized_number("1234567")` answers `"1,234,567"`, not the German
# `"1.234.567"`, because `Standard#set_default_options` fills every one of
# `DEFAULT_OPTIONS`' keys — including `:decimal` and `:group` — before
# `SymbolResolver#resolve` ever merges in the locale's own entry, so the
# locale-specific symbols are always shadowed by `Standard`'s own hardcoded
# `"."`/`","` unless the caller passes `decimal`/`group` explicitly. The base
# `Plurimath::NumberFormatter` class has no such defaulting — passed an empty
# `localizer_symbols:` hash, it renders straight off `SupportedLocales::
# LOCALES[locale][:group]` — so THAT class is the live call this generator
# uses to verify the column, matching what `SupportedLocales.decimal_for` and
# the grammar already agree `decimal` means for the same locale.
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
#   src/formatting/generated/locale-groups.ts    locale key -> group marker
#   src/formatting/generated/provenance.ts       what the tables were generated from
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

  # `SupportedLocales.symbols_for` is public (unlike the private `LOCALES`
  # projection this generator used to read straight off the constant): reading
  # through it, rather than `LOCALES[key]` directly, keeps this measurement on
  # the same public surface `decimal_for` uses, so a future refactor of the
  # constant's shape breaks this generator the same way it would break the
  # gem's own `decimal_for`.
  def measured_group(key)
    marker = supported_locales.symbols_for(key).fetch(:group, MISSING)
    if marker.equal?(MISSING) || !marker.is_a?(::String) || marker.empty?
      raise Error, "#{key.inspect}: symbols_for(...).fetch(:group) answered " \
                   "#{marker.inspect}, not a marker"
    end

    as_string = supported_locales.symbols_for(key.to_s).fetch(:group, MISSING)
    unless as_string == marker
      raise Error, "#{key.inspect}: the String spelling's group is " \
                   "#{as_string.inspect}, the Symbol spelling's is #{marker.inspect}"
    end

    marker
  end

  # The live render call `Formatter::Standard` cannot serve (module doc
  # above): the base `NumberFormatter`, given no `localizer_symbols` of its
  # own, resolves symbols straight off the locale's `SupportedLocales` entry.
  # A seven-digit integer exercises two group boundaries under the gem's
  # default `group_digits: 3`, so a marker that lands in the wrong place would
  # still be caught even if it happened to also be a substring elsewhere.
  GROUP_PROBE_INTEGER = "1234567"

  def rendered_with_locale_defaults(locale)
    Plurimath::NumberFormatter.new(locale, localizer_symbols: {})
      .localized_number(GROUP_PROBE_INTEGER)
  end

  def grouped_with_marker(marker)
    "1#{marker}234#{marker}567"
  end

  # The behaviour the marker exists to switch, rendered rather than parsed:
  # under its own marker the probe integer groups exactly as expected, and
  # under every other marker the table holds, it does not.
  def verify_group_entry!(locale, group, all_groups)
    rendered = rendered_with_locale_defaults(locale)
    expected = grouped_with_marker(group)
    unless rendered == expected
      raise Error, "#{locale}: rendering #{GROUP_PROBE_INTEGER.inspect} under its own " \
                   "locale defaults gave #{rendered.inspect}, expected #{expected.inspect} " \
                   "using group #{group.inspect}"
    end

    (all_groups - [group]).each do |other|
      next unless rendered == grouped_with_marker(other)

      raise Error, "#{locale}: also matches grouping with #{other.inspect}, so " \
                   "#{group.inspect} is not distinguishable from it by rendering alone"
    end
  end

  def locale_rows
    keys = supported_locales::LOCALES.keys
    raise Error, "the gem's locale table is empty" if keys.empty?

    unless keys.all?(::Symbol)
      raise Error, "the gem's locale keys are no longer Symbols"
    end

    rows = keys.map { |key| [key.to_s, measured_marker(key), measured_group(key)] }
    locales = rows.map(&:first)
    unless locales.uniq.length == locales.length
      raise Error, "duplicate locale keys after String projection: " \
                   "#{locales.tally.select { |_, n| n > 1 }.keys.join(', ')}"
    end

    markers = rows.map { |_, decimal, _| decimal }.uniq
    groups = rows.map { |_, _, group| group }.uniq
    rows.each do |locale, marker, group|
      verify_entry!(locale, marker, markers)
      verify_group_entry!(locale, group, groups)
    end
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

  # `Formatter::Standard::DEFAULT_OPTIONS[:group]` is what a `Standard`
  # instance falls back to for every locale (module doc above — that
  # defaulting is exactly what shadows a non-"en" locale's own group marker),
  # and it agrees with `FormatOptions::DEFAULT_GROUP`, the fallback the render
  # pipeline itself uses when no symbol supplies `:group` at all. Both are
  # verified against a live default-options render, not trusted as constants.
  def measured_default_group_marker
    declared = Plurimath::Formatter::Standard::DEFAULT_OPTIONS.fetch(:group)
    unless declared.is_a?(::String) && !declared.empty?
      raise Error, "Formatter::Standard::DEFAULT_OPTIONS[:group] is " \
                   "#{declared.inspect}, not a marker"
    end

    format_options_default = Plurimath::Formatter::Numbers::FormatOptions::DEFAULT_GROUP
    unless format_options_default == declared
      raise Error, "FormatOptions::DEFAULT_GROUP is #{format_options_default.inspect}, " \
                   "not #{declared.inspect}"
    end

    rendered = Plurimath::Formatter::Standard.new.localized_number(GROUP_PROBE_INTEGER)
    expected = grouped_with_marker(declared)
    unless rendered == expected
      raise Error, "Formatter::Standard.new with no options rendered " \
                   "#{GROUP_PROBE_INTEGER.inspect} as #{rendered.inspect}, expected " \
                   "#{expected.inspect} using the declared default group #{declared.inspect}"
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
    markers = rows.map { |_, decimal, _| decimal }
    marker_count = markers.uniq.length
    tuple_lines = rows.map do |locale, marker, _|
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

        The `group` column is emitted alongside it, in `./locale-groups.ts` —
        a render-time concern rather than a parse-time one, so it is a
        sibling file rather than a column here (ARCHITECTURE.md §9).
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

  def emit_locale_groups_file(out_root, default_group, rows)
    groups = rows.map { |_, _, group| group }
    group_count = groups.uniq.length
    tuple_lines = rows.map do |locale, _, group|
      "  [#{CoreDataGenerator.ts_string(locale)}, #{CoreDataGenerator.ts_string(group)}],"
    end
    sections = [
      ts_header(<<~TEXT.chomp),
        `Formatter::SupportedLocales::LOCALES`, projected onto its `group`
        column, in the gem's declaration order — the same order `./
        locale-decimals.ts` keeps for the `decimal` column, so the two tables'
        rows line up by index as well as by key.

        Nothing at PARSE time reads this column (only `decimal` feeds the
        AsciiMath grammar), so it has no read-back-by-parse verification to
        reuse. It is verified instead by a live RENDER call, and deliberately
        NOT through `Formatter::Standard` — measured on the oracle,
        `Formatter::Standard.new(locale: "de").localized_number("1234567")`
        answers `"1,234,567"`, not the German `"1.234.567"`, because
        `Standard#set_default_options` fills `:decimal`/`:group` from its own
        `DEFAULT_OPTIONS` before the locale's entry is ever merged in, so a
        `Standard` always renders the "en" symbols unless the caller passes
        `decimal`/`group` explicitly. The base `Plurimath::NumberFormatter`
        class has no such defaulting: given an empty `localizer_symbols:`
        hash, it resolves symbols straight off this same `SupportedLocales`
        entry, so that is the live call this generator verifies against —
        rendering a seven-digit probe integer under the locale's own group
        marker, and confirming none of the table's OTHER markers would have
        produced the same rendering.
      TEXT
      [
        CoreDataGenerator.ts_doc(
          "Ruby: `Formatter::Standard::DEFAULT_OPTIONS[:group]`, which agrees with\n" \
          "`Formatter::Numbers::FormatOptions::DEFAULT_GROUP` — verified as what a\n" \
          "default-options `Formatter::Standard` actually renders a multi-group\n" \
          "integer with.",
        ),
        "export const DEFAULT_GROUP_MARKER = " \
        "#{CoreDataGenerator.ts_string(default_group)};",
      ].join("\n"),
      [
        CoreDataGenerator.ts_doc(
          "Locale key -> group marker: #{rows.length} entries, #{group_count} distinct\n" \
          "markers. `as const`, for the same reason `./locale-decimals.ts` marks its\n" \
          "tuples `as const` — a widened `string[][]` would erase the literal types a\n" \
          "closed union could otherwise derive from these.",
        ),
        "export const LOCALE_GROUP_MARKERS = [",
        *tuple_lines,
        "] as const;",
      ].join("\n"),
    ]
    CoreDataGenerator.write_ts(File.join(out_root, "locale-groups.ts"), sections)
  end

  # --- driver --------------------------------------------------------------

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

  def run(argv)
    options = CoreDataGenerator.parse_options(argv, out_default: File.join(REPO_ROOT, OUT_REL))
    if options[:help]
      puts CoreDataGenerator.usage(GENERATOR_PATH)
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
    dirty = CoreDataGenerator.check_checkouts!(gem_dir, options[:out], options[:allow_dirty])

    default_marker = measured_default_marker
    default_group = measured_default_group_marker
    rows = locale_rows
    provenance = CoreDataGenerator.build_provenance(
      GENERATOR_PATH, generator_input_hashes, gem_dir, dirty, options[:allow_dirty],
    )

    written = [
      emit_locale_decimals_file(options[:out], default_marker, rows),
      emit_locale_groups_file(options[:out], default_group, rows),
      CoreDataGenerator.emit_provenance_file(
        options[:out], provenance,
        header_section: CoreDataGenerator.ts_doc(<<~TEXT.chomp),
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
        interface_name: "FormattingGeneratedProvenance",
        const_name: "FORMATTING_GENERATED_PROVENANCE",
      ),
    ]
    written.sort.each { |path| puts "  #{relative(path)}" }
    decimal_count = rows.map { |_, decimal, _| decimal }.uniq.length
    group_count = rows.map { |_, _, group| group }.uniq.length
    puts "#{rows.length} locales, #{decimal_count} distinct decimal markers " \
         "(default #{default_marker.inspect}, verified by parse), " \
         "#{group_count} distinct group markers " \
         "(default #{default_group.inspect}, verified by render)"
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
