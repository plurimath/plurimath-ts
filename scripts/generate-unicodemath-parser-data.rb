# frozen_string_literal: true

# Generates the constant tables the UnicodeMath *grammar* reads — the
# alternatives `Plurimath::UnicodeMath::Parse` builds its rules from, consumed
# by `src/formats/unicodemath/grammar.ts` — and the class-resolution tables the
# UnicodeMath *transform* reads, consumed by
# `src/formats/unicodemath/registry.ts`.
#
# `UnicodeMath::Constants` holds 42 constants. 33 of them the grammar reaches,
# plus one derived table; three more — `BINARY_FUNCTIONS`, `NARY_CLASSES` and
# `PREFIXED_PRIMES` — the transform reaches, and are emitted here too. The list
# is not a judgement call: `unicode_math/parsing_rules/constants_rules.rb` is the
# single file that turns constants into rules, and every `Constants::` reference
# under `unicode_math/` was enumerated to build `TABLES` and
# `TRANSFORM_CONSTANT_SOURCES` below.
#
# **The collision this file exists to make impossible — and it is NOT the one
# the LaTeX generator guards.** `scripts/generate-latex-parser-data.rb` emits
# tuples because `Latex::Constants.symbols_constants` merges a Symbol-keyed hash
# into a String-keyed one, so nineteen texts appear twice and a Map keyed by the
# text would delete one of each pair. That shape does not exist here, and it was
# checked rather than assumed: every Hash in `UnicodeMath::Constants` is
# uniformly Symbol-keyed with String values, no hash mixes key classes, and no
# two keys of one hash collide under `to_s`. `assert_no_mixed_key_classes!`
# re-establishes that on every run, so the day upstream introduces one, this
# generator fails instead of quietly emitting a collapsed table.
#
# What DOES collide here is `Hash#values`. Nine of the emitted tables repeat a
# text — `RELATIONAL_SYMBOLS.values` has 195 entries and 185 distinct ones,
# `ORDINARY_SYMBOLS.values` carries `&#x2026;` three times — because several
# named symbols share one code point and the gem never deduplicates. The
# emitted shape is therefore an **ordered array of strings**, which cannot
# collapse; a `Map`, a `Set`, or an object keyed by the text would silently
# shorten those ten tables. The repeats are dead alternatives in the gem too
# (Parslet's `|` is ordered, so the second occurrence is unreachable), and they
# are carried anyway so the emitted array is the gem's array rather than an
# improved one.
#
# Order is behaviour throughout. `arr_to_expression`
# (`parsing_rules/constants_rules.rb:104`) folds each array into a Parslet
# ordered choice with no longest-match backtracking, so these arrays keep the
# gem's own order and are never sorted here.
#
# `WRAPPER_SYMBOLS` is different in kind from the rest and is labelled as such
# in the emitted file. `Constants.wrapper_symbols` is *derived*:
# `Utility.symbols_hash(:unicodemath).keys.grep(/"P\{[^\}]+\}/)`, reflected off
# every loaded `Math::Symbols::Symbol` descendant's `INPUT[:unicodemath]`. Its
# entries are the literal text `Symbol.parsing_wrapper` renders for
# `lang: :unicode` — `"P{name}"`, quotes included — which is what the gem emits
# for a symbol it cannot spell in UnicodeMath. They are placeholders that
# round-trip, not real UnicodeMath notation, and no hand-written table could
# reproduce the reflection, so they are emitted.
#
# Layer rules: this output is the UnicodeMath format module's own data, under
# that module's own directory (ARCHITECTURE.md §3 rules 1 and 3). It is a
# separate generator from scripts/generate-corpus.rb, and lives beside the
# module rather than under `src/generated/unicodemath/`, because that directory
# belongs to the corpus generator: `src/generated/provenance.ts` states it
# records what every file under `src/generated/` was generated from, and a
# second generator writing there would make that sentence false.
#
# Usage, from the plurimath-ts repository root:
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile \
#     mise x -- bundle exec ruby scripts/generate-unicodemath-parser-data.rb
#
# Options:
#   --gem PATH        gem checkout to treat as the oracle
#                     (default: the checkout bundler resolved `plurimath` from)
#   --out PATH        output root
#                     (default: <repo>/src/formats/unicodemath/generated)
#   --allow-dirty     generate from a dirty checkout; the output is marked
#                     non-committable in the provenance file (§7)
#   --help
#
# Outputs:
#   src/formats/unicodemath/generated/parser-tables.ts     the grammar's tables
#   src/formats/unicodemath/generated/transform-tables.ts  the transform's tables
#   src/formats/unicodemath/generated/provenance.ts        what they came from
#
# The generator is deterministic: two runs over the same oracle produce
# byte-identical output. No timestamps, no absolute paths; every table keeps
# the gem's own order.

require_relative "generate-core-data"

module UnicodeMathParserDataGenerator
  class Error < StandardError; end

  REPO_ROOT = File.expand_path("..", __dir__)
  GENERATOR_PATH = "scripts/generate-unicodemath-parser-data.rb"
  OUT_REL = "src/formats/unicodemath/generated"

  # Every file whose bytes can change what this generator emits: itself, plus
  # the two generators it borrows TypeScript emission, provenance, git and
  # hashing helpers from. Hashing only the entry point would let a change to a
  # shared file move a table while the recorded hash stayed identical.
  GENERATOR_INPUT_PATHS = [
    GENERATOR_PATH,
    CoreDataGenerator::GENERATOR_PATH,
    CorpusGenerator::GENERATOR_PATH,
  ].freeze

  # Emitted table -> how the gem reaches it.
  #
  #   source:  the `Constants` expression, as written in constants_rules.rb
  #   rule:    the `UnicodeMath::Parse` rule `arr_to_expression` builds from it
  #   prefix:  what that rule requires before the literal. Roughly half the
  #            rules are `slash >> arr_to_expression(...)`, and one is prefixed
  #            by U+2132 rather than a backslash.
  #   also:    a second rule built from the SAME array with a different tag.
  #            `ORDINARY_SYMBOLS` and `BINARY_SYMBOLS` each feed a plain and a
  #            "negated" rule, so one emitted table serves two rules; that claim
  #            is checked by parsing every entry through both.
  #
  # Every entry of every table is parsed through its own rule (and its `also`
  # rule) before emission, so an entry the grammar cannot actually reach fails
  # generation rather than shipping as a dead alternative.
  SLASH = "\\"

  TABLES = [
    ["UNICODEMATH_OPEN_SYMBOLS_KEYS", "OPEN_SYMBOLS.keys", :op_open, SLASH, nil],
    ["UNICODEMATH_OPEN_SYMBOLS", "OPEN_SYMBOLS.values", :op_open_unicode, "", nil],
    ["UNICODEMATH_CLOSE_SYMBOLS_KEYS", "CLOSE_SYMBOLS.keys", :op_close, SLASH, nil],
    ["UNICODEMATH_CLOSE_SYMBOLS", "CLOSE_SYMBOLS.values", :op_close_unicode, "", nil],
    ["UNICODEMATH_FONTS_CLASSES", "FONTS_CLASSES", :op_fonts, SLASH, nil],
    ["UNICODEMATH_ALPHANUMERIC_FONTS_CLASSES", "ALPHANUMERIC_FONTS_CLASSES",
     :op_alphanumeric_fonts, SLASH, nil],
    ["UNICODEMATH_ACCENT_SYMBOLS_KEYS", "ACCENT_SYMBOLS.keys", :op_accent_prefixed, SLASH, nil],
    ["UNICODEMATH_ACCENT_SYMBOLS", "ACCENT_SYMBOLS.values", :op_accent, "", nil],
    ["UNICODEMATH_MATRIXS_KEYS", "MATRIXS.keys", :op_prefixed_matrixs, SLASH, nil],
    ["UNICODEMATH_MATRIXS", "MATRIXS.values", :op_matrixs, "", nil],
    ["UNICODEMATH_NEGATABLE_SYMBOLS", "NEGATABLE_SYMBOLS", :op_negated, "", nil],
    ["UNICODEMATH_PREFIXED_NEGATABLE_SYMBOLS", "PREFIXED_NEGATABLE_SYMBOLS",
     :op_prefixed_negated, SLASH, nil],
    ["UNICODEMATH_SKIP_SYMBOLS_KEYS", "SKIP_SYMBOLS.keys", :skip_symbols_prefixed, SLASH, nil],
    ["UNICODEMATH_SKIP_SYMBOLS", "SKIP_SYMBOLS.values", :skip_symbols, "", nil],
    ["UNICODEMATH_SUB_ALPHABETS", "SUB_ALPHABETS.values", :op_sub_alpha, "", nil],
    ["UNICODEMATH_SUP_ALPHABETS", "SUP_ALPHABETS.values", :op_sup_alpha, "", nil],
    ["UNICODEMATH_NARY_SYMBOLS_KEYS", "NARY_SYMBOLS.keys", :op_nary_text, SLASH, nil],
    ["UNICODEMATH_NARY_SYMBOLS", "NARY_SYMBOLS.values", :op_nary_symbols, "", nil],
    ["UNICODEMATH_HORIZONTAL_BRACKETS_KEYS", "HORIZONTAL_BRACKETS.keys",
     :op_h_bracket_prefixed, SLASH, nil],
    ["UNICODEMATH_HORIZONTAL_BRACKETS", "HORIZONTAL_BRACKETS.values", :op_h_bracket, "", nil],
    ["UNICODEMATH_OPEN_PARENTHESIS", "OPEN_PARENTHESIS", :op_open_paren, "", nil],
    ["UNICODEMATH_CLOSE_PARENTHESIS", "CLOSE_PARENTHESIS", :op_close_paren, "", nil],
    ["UNICODEMATH_SUP_DIGITS", "SUP_DIGITS.values", :op_sup_digits, "", nil],
    ["UNICODEMATH_SUB_DIGITS", "SUB_DIGITS.values", :op_sub_digits, "", nil],
    ["UNICODEMATH_UNARY_SYMBOLS_KEYS", "UNARY_SYMBOLS.keys", :op_prefixed_unary_symbols,
     SLASH, nil],
    ["UNICODEMATH_UNARY_SYMBOLS", "UNARY_SYMBOLS.values", :op_unary_symbols, "", nil],
    ["UNICODEMATH_SUB_OPERATORS", "SUB_OPERATORS.values", :op_sub_operators, "", nil],
    ["UNICODEMATH_SUP_OPERATORS", "SUP_OPERATORS.values", :op_sup_operators, "", nil],
    ["UNICODEMATH_BINARY_SYMBOLS_KEYS", "BINARY_SYMBOLS.keys", :op_binary_symbols_prefixed,
     SLASH, :op_prefixed_binary_negated],
    ["UNICODEMATH_BINARY_SYMBOLS", "BINARY_SYMBOLS.values", :op_binary_symbols, "",
     :op_binary_negated],
    ["UNICODEMATH_SUB_OPEN_PARENTHESIS", "SUB_PARENTHESIS[:open].values", :op_sub_open_paren,
     "", nil],
    ["UNICODEMATH_SUB_CLOSE_PARENTHESIS", "SUB_PARENTHESIS[:close].values", :op_sub_close_paren,
     "", nil],
    ["UNICODEMATH_SUP_OPEN_PARENTHESIS", "SUP_PARENTHESIS[:open].values", :op_sup_open_paren,
     "", nil],
    ["UNICODEMATH_SUP_CLOSE_PARENTHESIS", "SUP_PARENTHESIS[:close].values", :op_sup_close_paren,
     "", nil],
    ["UNICODEMATH_UNARY_FUNCTIONS", "UNARY_FUNCTIONS", :op_unary_functions, "", nil],
    ["UNICODEMATH_DIACRITIC_BELOWS", "DIACRITIC_BELOWS", :op_diacritic_belows, "", nil],
    ["UNICODEMATH_DIACRITIC_OVERLAYS", "DIACRITIC_OVERLAYS", :op_diacritic_overlays, "", nil],
    ["UNICODEMATH_COMBINING_SYMBOLS_KEYS", "COMBINING_SYMBOLS.keys", :op_combined_symbols,
     "", nil],
    ["UNICODEMATH_COMBINING_SYMBOLS", "COMBINING_SYMBOLS.values", :op_combined_unicode, "", nil],
    ["UNICODEMATH_ORDINARY_SYMBOLS_KEYS", "ORDINARY_SYMBOLS.keys", :op_prefixed_ordinary_symbols,
     SLASH, :op_prefixed_ordinary_negated],
    ["UNICODEMATH_ORDINARY_SYMBOLS", "ORDINARY_SYMBOLS.values", :op_ordinary_symbols, "",
     :op_ordinary_negated],
    ["UNICODEMATH_UNICODE_FRACTIONS", "UNICODE_FRACTIONS.keys", :op_unicode_fractions, "", nil],
    ["UNICODEMATH_RELATIONAL_SYMBOLS_KEYS", "RELATIONAL_SYMBOLS.keys", :op_relational_symbols,
     SLASH, nil],
    ["UNICODEMATH_RELATIONAL_SYMBOLS", "RELATIONAL_SYMBOLS.values", :op_relational_unicode,
     "", nil],
    ["UNICODEMATH_UNARY_ARG_FUNCTIONS_KEYS", "UNARY_ARG_FUNCTIONS.keys",
     :op_prefixed_unary_arg_functions, SLASH, nil],
    ["UNICODEMATH_UNARY_ARG_FUNCTIONS", "UNARY_ARG_FUNCTIONS.values", :op_unary_arg_functions,
     "", nil],
    ["UNICODEMATH_SIZE_OVERRIDES_SYMBOLS", "SIZE_OVERRIDES_SYMBOLS.keys",
     :op_size_overrides_symbols, "&#x2132;", nil],
    ["UNICODEMATH_WRAPPER_SYMBOLS", "Constants.wrapper_symbols", :wrapper_symbols, "", nil],
  ].freeze

  # The `Constants` tables the TRANSFORM reads that the grammar does not, each
  # with the emitted name it becomes. `PREFIXED_PRIMES` is reached indirectly:
  # `Utility.primes_constants` (`utility.rb:292-297`) is that hash merged with
  # `{ sprime: "&#x27;" }`, and the merged result is what the transform tests.
  TRANSFORM_CONSTANT_SOURCES = {
    "BINARY_FUNCTIONS" => "UNICODEMATH_BINARY_FUNCTIONS",
    "NARY_CLASSES" => "UNICODEMATH_NARY_CLASSES",
    "PREFIXED_PRIMES" => "UNICODEMATH_PRIMES_CONSTANTS",
  }.freeze

  # `Constants` entries neither the grammar nor the ported transform slice
  # reads. Named so the emitted set is a measured subset rather than an
  # unexplained one, and so a constant that appears upstream later fails the
  # inventory assertion instead of being silently ignored.
  #
  # `UNDEF_UNARY_FUNCTIONS` is the one entry here the transform DOES read. It is
  # not emitted by this generator because `scripts/generate-corpus.rb` already
  # emits it as `UNICODEMATH_UNDEF_UNARY_FUNCTIONS` in
  # `src/generated/unicodemath/render-tables.ts`, and one table generated twice
  # is one table that can drift. The others are read only by transform rules
  # this slice defers.
  UNCONSUMED_CONSTANTS = %w[
    BELOWS_NOTATIONS OVERLAYS_NOTATIONS PARENTHESIS_MATRICES PHANTOM_SYMBOLS
    UNDEF_UNARY_FUNCTIONS UNDER_HORIZONTAL_BRACKETS
  ].freeze

  # `UNICODED_FONTS` reaches the grammar through its own builder,
  # `unicoded_fonts_to_expression` (`constants_rules.rb:113`), not through
  # `arr_to_expression`, so it is emitted with its nesting intact rather than
  # flattened into the table list above.
  UNICODED_FONTS_RULE = :unicoded_fonts

  module_function

  # --- measurement ---------------------------------------------------------

  def constants
    Plurimath::UnicodeMath::Constants
  end

  # One parser instance for every rule probe. Parslet memoizes a rule's atom on
  # the instance the first time it is used, and rebuilding the 1,492-entry
  # `wrapper_symbols` alternation per probe would dominate the run.
  def parser
    @parser ||= Plurimath::UnicodeMath::Parse.new
  end

  # Parses `text` through one rule of the gem's own grammar, with Parslet's
  # `consume_all`, and answers the tree or nil.
  def rule_parse(text, rule, on: parser)
    on.public_send(rule).parse(text)
  rescue Parslet::ParseFailed
    nil
  end

  # The claim the emitted shape rests on, re-established every run.
  #
  # The LaTeX tables need tuples because one hash there carries both Symbol and
  # String keys. No hash here does. If upstream ever introduces one, a plain
  # `to_s` projection would collapse the pair and delete a live alternative, so
  # this refuses rather than emitting it.
  def assert_no_mixed_key_classes!
    constants.constants.sort.each do |name|
      value = constants.const_get(name)
      next unless value.is_a?(::Hash)

      classes = value.keys.map(&:class).uniq
      unless classes == [::Symbol]
        raise Error, "UnicodeMath::Constants::#{name} is keyed by " \
                     "#{classes.map(&:name).join(' + ')}, not by Symbol alone; " \
                     "the emitted array shape assumes a single key class"
      end

      collisions = value.keys.map(&:to_s).tally.select { |_, count| count > 1 }.keys
      next if collisions.empty?

      raise Error, "UnicodeMath::Constants::#{name} has keys that collide under " \
                   "to_s (#{collisions.join(', ')}); projecting them onto Strings " \
                   "would drop an alternative"
    end
  end

  # Every `Constants` entry is either emitted or named unconsumed. A constant
  # that is neither fails here, so an upstream addition is a generator failure
  # rather than a table the port silently lacks.
  def assert_constant_inventory!
    # `Constants.wrapper_symbols` is a method, not a constant, so it names none.
    emitted = TABLES.filter_map do |_, source, _, _, _|
      source[/\A[A-Z][A-Z_]+/] unless source.start_with?("Constants.")
    end.uniq
    emitted |= ["UNICODED_FONTS"]
    emitted |= TRANSFORM_CONSTANT_SOURCES.keys
    overlap = emitted & UNCONSUMED_CONSTANTS
    unless overlap.empty?
      raise Error, "#{overlap.join(', ')} is both emitted and named unconsumed; " \
                   "the union below would hide the contradiction"
    end

    known = (emitted | UNCONSUMED_CONSTANTS).sort
    actual = constants.constants.map(&:to_s).sort
    return if known == actual

    raise Error, <<~MESSAGE
      UnicodeMath::Constants changed shape.
        emitted or named unconsumed but absent upstream: #{(known - actual).join(', ')}
        present upstream but neither emitted nor named:  #{(actual - known).join(', ')}
    MESSAGE
  end

  # A `Constants` array or hash key/value list, projected onto Strings, with
  # every entry parsed back through the rule it builds.
  def literal_list(name, values, rule, prefix, also)
    unless values.is_a?(::Array)
      raise Error, "#{name} is #{values.class}; expected an Array"
    end
    if values.empty?
      raise Error, "#{name} is empty; the rule it builds would match nothing"
    end

    texts = values.map do |value|
      unless value.is_a?(::String) || value.is_a?(::Symbol)
        raise Error, "#{name} holds a #{value.class}; expected String or Symbol"
      end

      value.to_s
    end

    [rule, also].compact.each do |probe|
      texts.each do |text|
        next unless rule_parse("#{prefix}#{text}", probe).nil?

        raise Error, "#{name}: the gem's own `#{probe}` rule refuses " \
                     "#{"#{prefix}#{text}".inspect}, so the projection onto " \
                     "Strings is wrong"
      end
    end
    texts
  end

  def literal_tables
    TABLES.to_h do |name, source, rule, prefix, also|
      # `module_eval` rather than `instance_eval`: the source strings are written
      # as they appear in constants_rules.rb, so `OPEN_SYMBOLS` must resolve
      # against the module's own constants rather than its singleton class.
      values = source == "Constants.wrapper_symbols" ? constants.wrapper_symbols
                                                     : constants.module_eval(source)
      [name, literal_list(name, values, rule, prefix, also)]
    end
  end

  # Which emitted tables repeat a text, and how often. Reported rather than
  # refused: the repeats are the gem's, and dropping them would make the
  # emitted array something other than the gem's array. Emitted into the
  # TypeScript so the array-not-Map decision carries its own evidence.
  def duplicate_report(tables)
    tables.filter_map do |name, texts|
      repeats = texts.tally.select { |_, count| count > 1 }
      next if repeats.empty?

      [name, texts.length, texts.uniq.length, repeats.values.sum - repeats.length]
    end
  end

  # `UNICODED_FONTS` as ordered [font class, [[key, text], ...]] rows.
  #
  # `hash_values` (`constants_rules.rb:122`) treats a one-entry inner hash
  # differently from a many-entry one: one entry becomes a bare `str(text)` with
  # no `.as`, many become an alternation of
  # `str(font).absent?.as(font).as(:unicoded_font_class) >> str(text).as(:symbol)`.
  # Both shapes are emitted as they stand and the grammar reproduces the branch;
  # every text is parsed through `unicoded_fonts` here first.
  def unicoded_font_rows
    table = constants::UNICODED_FONTS
    unless table.is_a?(::Hash) && !table.empty?
      raise Error, "UNICODED_FONTS is #{table.class}; expected a non-empty Hash"
    end

    rows = table.map do |font, inner|
      unless inner.is_a?(::Hash) && !inner.empty?
        raise Error, "UNICODED_FONTS[#{font.inspect}] is #{inner.class}; expected a Hash"
      end

      entries = inner.map { |key, text| [key.to_s, text.to_s] }
      entries.each do |_, text|
        next unless rule_parse(text, UNICODED_FONTS_RULE).nil?

        raise Error, "`unicoded_fonts` refuses #{text.inspect} from " \
                     "UNICODED_FONTS[#{font.inspect}]"
      end
      [font.to_s, entries]
    end
    assert_unicoded_font_branches!(rows)
    rows
  end

  # The one-entry / many-entry split is behaviour, so it is measured rather
  # than read off the source: a one-entry font contributes an UNNAMED atom and
  # a many-entry font a named one, which is visible in the tree.
  def assert_unicoded_font_branches!(rows)
    rows.each do |font, entries|
      text = entries.first.last
      tree = rule_parse(text, UNICODED_FONTS_RULE)
      named = tree.is_a?(::Hash)
      if entries.length == 1 && named
        raise Error, "UNICODED_FONTS[#{font.inspect}] has one entry but parses to " \
                     "#{tree.inspect}; `hash_values` was expected to emit a bare str"
      end
      if entries.length > 1 && !named
        raise Error, "UNICODED_FONTS[#{font.inspect}] has #{entries.length} entries but " \
                     "parses to #{tree.inspect}; a named alternation was expected"
      end
    end
  end

  # --- the decimal marker --------------------------------------------------

  # `decimal_marker` (`unicode_math/parse.rb:294`) does not match the configured
  # marker: it matches `Utility.string_to_html_entity(marker)`, because
  # `UnicodeMath::Parser#initialize` (`unicode_math/parser.rb:11`) entity-encodes
  # its input before Parslet sees it. For `.` and `,` that is the character
  # itself; for `ar`/`fa`'s U+066B it is the seven characters `&#x66b;`.
  #
  # Unlike LaTeX's, this marker is NOT exclusive and the generator does not
  # pretend otherwise. `op_decimal` (`unicode_math/parse.rb:60`) is
  # `decimal_marker | str(",") | str(".")`, so a comma and a full stop are
  # decimal markers under every locale; only the configured one is added. The
  # LaTeX generator can refute the other markers under each locale and this one
  # deliberately does not, because here the refutation would fail.
  def decimal_marker_rows
    locales = Plurimath::Formatter::SupportedLocales::LOCALES
    markers = locales.values.filter_map { |row| row[:decimal] }.uniq
    markers |= [Plurimath::Configuration::DEFAULT_DECIMAL]
    if markers.empty?
      raise Error, "the gem's locale table yielded no decimal markers"
    end

    rows = markers.sort.map { |marker| [marker, Plurimath::Utility.string_to_html_entity(+marker)] }
    rows.each { |marker, encoded| verify_marker!(locales, marker, encoded) }
    assert_always_on_markers!(rows)
    rows
  end

  def verify_marker!(locales, marker, encoded)
    locale = locales.find { |_, row| row[:decimal] == marker }&.first

    Plurimath.with_configuration do |configuration|
      configuration.locale = locale
      unless Plurimath.configuration.decimal == marker
        raise Error, "locale #{locale.inspect} reports decimal " \
                     "#{Plurimath.configuration.decimal.inspect}, not #{marker.inspect}"
      end

      # A FRESH parser per locale, never the memoized one: Parslet caches a
      # rule's atom on the instance the first time it is used, so a reused
      # parser would keep the marker of whichever locale reached it first —
      # which is also why `UnicodeMath::Parser#parse` builds a new `Parse` for
      # every call.
      fresh = Plurimath::UnicodeMath::Parse.new
      tree = rule_parse("1#{encoded}5", :number, on: fresh)
      unless decimal_number?(tree, encoded)
        raise Error, "under #{locale.inspect}, #{"1#{encoded}5".inspect} does not read " \
                     "as one decimal number (#{tree.inspect}); the encoded marker and " \
                     "the grammar disagree"
      end
    end
  end

  # `op_decimal`'s two hard-coded alternatives, asserted rather than described:
  # a comma and a full stop are decimal markers under EVERY locale, so the
  # emitted table is additive and the grammar must keep both fallbacks.
  def assert_always_on_markers!(rows)
    other = rows.map(&:first).find { |marker| ![".", ","].include?(marker) }
    locale = other && Plurimath::Formatter::SupportedLocales::LOCALES
      .find { |_, row| row[:decimal] == other }&.first
    return if locale.nil?

    Plurimath.with_configuration do |configuration|
      configuration.locale = locale
      fresh = Plurimath::UnicodeMath::Parse.new
      [".", ","].each do |fallback|
        tree = rule_parse("1#{fallback}5", :number, on: fresh)
        next if decimal_number?(tree, fallback)

        raise Error, "under #{locale.inspect}, #{"1#{fallback}5".inspect} is not a " \
                     "decimal number, so `op_decimal` no longer hard-codes #{fallback.inspect}"
      end
    end
  end

  def decimal_number?(tree, marker)
    return false unless tree.is_a?(::Hash)

    inner = tree[:decimal_number]
    inner.is_a?(::Hash) && inner[:decimal].to_s == marker
  end

  # --- the transform's tables ----------------------------------------------

  # The names `unicode_math/transform.rb` can feed to `Utility.get_class`.
  #
  # There are only two identifier shapes across the file's 18 `get_class`
  # mentions, and each is a GRAMMAR tag whose reachable texts are a `Constants`
  # table, so the set is enumerable rather than guessed at:
  #
  #   `unary`         bound by `unary_functions: simple(:unary)` (`:126`, `:1547`)
  #                   -> `Constants::UNARY_FUNCTIONS`, minus the seven
  #                   `UNDEF_UNARY_FUNCTIONS` texts, which take the
  #                   `symbols_class` arm and never reach `get_class`.
  #   `nary_function` derived from `nary_class: simple(:nary_class)`
  #                   -> `get_class` runs only inside
  #                   `if Constants::NARY_CLASSES.key?(nary_function.to_sym)`,
  #                   so the reachable names are `NARY_CLASSES.keys`.
  #
  # `matrix` (`get_table_class`) is the third, and this slice defers the
  # table/matrix rules, so no table-class table is emitted: emitting one would
  # ship data nothing reads.
  def get_class_sources
    sources = Hash.new { |hash, key| hash[key] = [] }
    (constants::UNARY_FUNCTIONS - constants::UNDEF_UNARY_FUNCTIONS).each do |name|
      sources[name] << "unary_functions"
    end
    constants::NARY_CLASSES.each_key { |name| sources[name.to_s] << "nary_class" }
    sources.transform_values { |tags| tags.uniq.sort }
  end

  # `Utility.get_class(name)`, or nil when the gem raises `NameError`. Measured,
  # never argued: the lookup is run.
  def resolve_class(name)
    Plurimath::Utility.get_class(name)
  rescue ::NameError
    nil
  end

  def class_entry(census_index, name, klass, sources, family:)
    entry = CorpusGenerator.transform_registry_entry(
      census_index, name, klass, sources, family: family
    )
    if entry["disposition"] == "deferred"
      raise Error, "#{name.inspect} resolves to #{entry['rubyClass']}, which the " \
                   "census defers (ARCHITECTURE.md §5); the UnicodeMath transform reaches it"
    end
    entry
  end

  def get_class_rows(census_index)
    resolved = []
    unresolved = []
    get_class_sources.sort.each do |name, sources|
      klass = resolve_class(name)
      if klass.nil?
        unresolved << name
        next
      end
      resolved << class_entry(census_index, name, klass, sources, family: true)
    end
    raise Error, "no get_class name resolved; the tag-to-table mapping is wrong" if resolved.empty?

    [resolved, unresolved.sort]
  end

  # `Utility::FONT_STYLES[fonts.to_sym]` at `transform.rb:236`. The `fonts`
  # binding comes from the `font_class` tag, which `constants_rules.rb:17` and
  # `:80` build from `FONTS_CLASSES` and `ALPHANUMERIC_FONTS_CLASSES`; a text
  # with no `FONT_STYLES` entry would make the rule call `.new` on nil, so a
  # miss stops generation rather than shipping.
  def font_style_rows(census_index)
    names = (constants::FONTS_CLASSES + constants::ALPHANUMERIC_FONTS_CLASSES).uniq
    missing = names.reject { |name| Plurimath::Utility::FONT_STYLES.key?(name.to_sym) }
    unless missing.empty?
      raise Error, "font_class text(s) #{missing.join(', ')} have no FONT_STYLES " \
                   "entry; `transform.rb:236` would raise NoMethodError on nil"
    end

    names.sort.map do |name|
      klass = Plurimath::Utility::FONT_STYLES.fetch(name.to_sym)
      entry = class_entry(census_index, name, klass, ["font_class"], family: false)
      entry.merge("defaultKeyword" => font_style_default_keyword(klass))
    end
  end

  # What a `FontStyle` subclass stores in `parameter_two` when it is given ONE
  # argument, which is how `transform.rb:236` calls it.
  #
  # It is not derivable from the name and it is not uniform: `Bold` defaults to
  # `"bold"`, `Normal` to `"rm"`, and six of the fourteen — `BoldFraktur`,
  # `BoldItalic`, `SansSerifBoldItalic`, `BoldSansSerif`, `BoldScript` and
  # `SansSerifItalic` — default to nil. Measured per class by constructing one
  # and reading the ivar back.
  FONT_STYLE_SENTINEL = "plurimath"

  def font_style_default_keyword(klass)
    instance = klass.new(FONT_STYLE_SENTINEL)
    stored = instance.instance_variable_get(:@parameter_one)
    unless stored == FONT_STYLE_SENTINEL
      raise Error, "#{klass.name}.new(text) stored #{stored.inspect} in parameter_one; " \
                   "the one-argument probe no longer measures what the transform builds"
    end

    keyword = instance.instance_variable_get(:@parameter_two)
    unless keyword.nil? || keyword.is_a?(::String)
      raise Error, "#{klass.name}.new(text) defaults parameter_two to a " \
                   "#{keyword.class}; expected String or nil"
    end

    keyword
  end

  # `Utility.all_symbols_classes(:unicodemath)` — `symbols_hash` merged with
  # `parens_hash`, the table `Utility.symbols_class(string, lang: :unicodemath)`
  # looks a STRIPPED text up in.
  #
  # Unlike the LaTeX table this one has no cache-order trap: nothing under
  # `unicode_math/` calls `parens_hash` with `skipables:`, so the memoized
  # parens half is the complete one whichever caller warms it. Asserted on
  # every run by comparing the merge against the union of its two halves.
  def symbol_class_rows
    symbols = Plurimath::Utility.symbols_hash(:unicodemath)
    parens = Plurimath::Utility.parens_hash(:unicodemath)
    merged = Plurimath::Utility.all_symbols_classes(:unicodemath)
    union = (symbols.keys | parens.keys).length
    unless merged.length == union
      raise Error, "all_symbols_classes(:unicodemath) has #{merged.length} entries but the " \
                   "union of its two halves has #{union}"
    end

    merged.map do |text, klass|
      unless text.is_a?(::String)
        raise Error, "all_symbols_classes(:unicodemath) is keyed by #{text.class}, not " \
                     "String; a Map would collapse entries the gem keeps apart"
      end

      [text, CorpusGenerator.class_key(klass).delete_prefix("Math::Symbols::")]
    end
  end

  def symbol_class_overlap
    (Plurimath::Utility.symbols_hash(:unicodemath).keys &
      Plurimath::Utility.parens_hash(:unicodemath).keys).sort
  end

  # The symbol classes the ported transform slice names as LITERALS rather than
  # reaching through a table, mapped to the ids the port carries. `Lround` and
  # `Rround` are the pair `Utility.valid_paren?` (`utility.rb:270-279`) tests
  # for, which is what decides whether `unfenced_value` unwraps a `Fenced`.
  NAMED_SYMBOL_CLASSES = {
    "lround" => "Plurimath::Math::Symbols::Paren::Lround",
    "rround" => "Plurimath::Math::Symbols::Paren::Rround",
  }.freeze

  def named_symbol_rows
    NAMED_SYMBOL_CLASSES.map do |role, constant|
      klass = begin
        Object.const_get(constant)
      rescue ::NameError
        raise Error, "#{constant} no longer exists; the transform names it directly"
      end
      [role, CorpusGenerator.class_key(klass).delete_prefix("Math::Symbols::")]
    end
  end

  # The classes the ported transform rules ask `is_a?` about, each with the
  # full set of classes that answer true — itself plus every descendant.
  #
  # `is_a?` is inheritance, not identity, and the port has only a node kind and
  # an alias basename to work with. Enumerating the answer here rather than
  # assuming "no subclasses" means an upstream subclass changes a regenerated
  # table instead of silently changing a branch.
  #
  #   Math::Formula                    `transform.rb:1019` (ubrace arm)
  #   Math::Function::BinaryFunction   `unicode_math/utility.rb:13`
  #   Math::Function::Nary             `transform.rb:1861`
  #   Math::Function::Overset          `transform.rb:1116`
  #   Math::Function::Power            `transform.rb:1019`
  #   Math::Function::TernaryFunction  `is_ternary_function?` (`core.rb:348`)
  #   Math::Function::UnaryFunction    `is_unary?` (`core.rb:330`)
  #   Math::Function::Underset         `transform.rb:1019`
  IS_A_PROBED_CLASSES = %w[
    Math::Formula
    Math::Function::BinaryFunction
    Math::Function::Nary
    Math::Function::Overset
    Math::Function::Power
    Math::Function::TernaryFunction
    Math::Function::UnaryFunction
    Math::Function::Underset
  ].freeze

  def is_a_rows(gem_dir)
    CorpusGenerator.load_model_classes!(gem_dir)
    IS_A_PROBED_CLASSES.map do |key|
      klass = begin
        Object.const_get("Plurimath::#{key}")
      rescue ::NameError
        raise Error, "Plurimath::#{key} no longer exists; a transform branch tests it"
      end
      family = ([klass] + CorpusGenerator.all_descendants(klass))
        .uniq.map { |k| CorpusGenerator.class_key(k) }.sort
      [key, family]
    end
  end

  def string_pairs(hash, where)
    hash.map do |key, value|
      unless value.is_a?(::String)
        raise Error, "#{where}[#{key.inspect}] is #{value.class}; expected String"
      end

      [key.to_s, value]
    end
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

  def ts_string_list(name, value, doc)
    CoreDataGenerator.ts_const(name, "readonly string[]", value, doc: doc)
  end

  # Wrapped by hand rather than by a formatter: `write_ts` refuses any line over
  # Biome's print width, and a doc comment is a line like any other.
  def table_doc(source, rule, prefix, also, texts)
    lines = ["`Constants::#{source}` -> `#{rule}`,", "built in `constants_rules.rb`."]
    lines << "Reached only behind a #{prefix.inspect} prefix." unless prefix.empty?
    if also
      lines << "The same array also builds `#{also}` with a"
      lines << "different tag; every entry was parsed through both."
    end
    repeats = texts.length - texts.uniq.length
    unless repeats.zero?
      lines << ""
      lines << "#{texts.length} entries, #{texts.uniq.length} distinct: #{repeats} repeat an"
      lines << "earlier text and are unreachable in the ordered choice."
      lines << "Carried so this stays the gem's array, not an improved one."
    end
    lines.join("\n")
  end

  def emit_tables_file(out_root, tables, fonts, duplicates, markers)
    sections = [
      ts_header(<<~TEXT.chomp),
        The constant tables `Plurimath::UnicodeMath::Parse` builds its rules from.

        Order is behaviour throughout. `arr_to_expression`
        (`unicode_math/parsing_rules/constants_rules.rb:104`) folds each table into
        a Parslet ordered choice, and Parslet's `|` has no longest-match
        backtracking — so these arrays keep the gem's own order and are never
        sorted here. Every entry was parsed back through the gem's own rule before
        emission.

        **Arrays, never Maps.** #{duplicates.length} of these tables repeat a text,
        because several named symbols share one code point and the gem's
        `Hash#values` does not deduplicate. Keying any of them by the text would
        silently shorten it. Unlike the LaTeX tables, no hash here mixes Symbol and
        String keys — every `UnicodeMath::Constants` hash is uniformly Symbol-keyed,
        re-checked on every run.
      TEXT
      *TABLES.map do |name, source, rule, prefix, also|
        ts_string_list(name, tables.fetch(name), table_doc(source, rule, prefix, also,
                                                           tables.fetch(name)))
      end,
      [
        CoreDataGenerator.ts_doc(
          "One `UNICODED_FONTS` row: the font class, and its key -> text pairs.\n" \
          "\n" \
          "`hash_values` (`constants_rules.rb:122`) branches on the inner hash's\n" \
          "size, and the branch is visible in the tree: a one-entry font\n" \
          "contributes a bare `str(text)` with no tag, a many-entry font an\n" \
          "alternation of `str(font).absent?.as(font).as(:unicoded_font_class) >>\n" \
          "str(text).as(:symbol)`. Measured per font before emission, not read off\n" \
          "the source.",
        ),
        "export type UnicodemathUnicodedFont = readonly [\n" \
        "  fontClass: string,\n" \
        "  entries: ReadonlyArray<readonly [key: string, text: string]>,\n" \
        "];",
      ].join("\n"),
      [
        CoreDataGenerator.ts_doc(
          "`Constants::UNICODED_FONTS` — `unicoded_fonts`\n" \
          "(`constants_rules.rb:41`), built by `unicoded_fonts_to_expression`\n" \
          "rather than by `arr_to_expression`, which is why it keeps its nesting.",
        ),
        "export const UNICODEMATH_UNICODED_FONTS: readonly UnicodemathUnicodedFont[] = [",
        *fonts.flat_map do |font, entries|
          pairs = entries.map do |key, text|
            "[#{CoreDataGenerator.ts_string(key)}, #{CoreDataGenerator.ts_string(text)}]"
          end
          # Biome collapses a row that fits its print width and expands one that
          # does not, so the emitter makes the same call: `mitBbb` has five
          # entries and does not fit.
          flat = "  [#{CoreDataGenerator.ts_string(font)}, [#{pairs.join(', ')}]],"
          next [flat] if flat.length <= 100

          ["  [", "    #{CoreDataGenerator.ts_string(font)},", "    [",
           *pairs.map { |pair| "      #{pair}," }, "    ],", "  ],"]
        end,
        "];",
      ].join("\n"),
      [
        CoreDataGenerator.ts_doc(
          "The tables that carry a text more than once, as\n" \
          "[table, entries, distinct, unreachable repeats].\n" \
          "\n" \
          "Emitted so the array-not-Map decision above carries its own evidence:\n" \
          "`test/formats/unicodemath/parser-tables.spec.ts` asserts each named\n" \
          "table still has exactly this many entries, so a future change to a\n" \
          "keyed shape fails loudly instead of shortening a grammar alternation.",
        ),
        "export const UNICODEMATH_REPEATED_TEXT_TABLES: ReadonlyArray<\n" \
        "  readonly [table: string, entries: number, distinct: number, repeats: number]\n" \
        "> = [",
        *duplicates.map do |name, total, distinct, repeats|
          "  [#{CoreDataGenerator.ts_string(name)}, #{total}, #{distinct}, #{repeats}],"
        end,
        "];",
      ].join("\n"),
      CoreDataGenerator.ts_tuple_map(
        "UNICODEMATH_ENCODED_DECIMAL_MARKERS", "ReadonlyMap<string, string>", markers,
        doc: "Decimal marker -> the text `decimal_marker`\n" \
             "(`unicode_math/parse.rb:294`) actually matches.\n" \
             "\n" \
             "The gem does not match the marker: it matches\n" \
             "`Utility.string_to_html_entity(marker)`, because `UnicodeMath::Parser`\n" \
             "entity-encodes its input before Parslet sees it. `.` and `,` encode to\n" \
             "themselves; `ar`/`fa`'s U+066B encodes to seven characters.\n" \
             "\n" \
             "Additive, not exclusive: `op_decimal` (`unicode_math/parse.rb:60`) is\n" \
             "`decimal_marker | str(\",\") | str(\".\")`, so a comma and a full stop\n" \
             "are decimal markers under every locale and the configured marker is a\n" \
             "third alternative. Asserted on every run.",
      ),
    ]
    CoreDataGenerator.write_ts(File.join(out_root, "parser-tables.ts"), sections)
  end

  # One `readonly Entry[]` of object literals, one field per line — the shape
  # Biome prints for records this wide, and the shape the LaTeX transform
  # tables already use.
  def ts_entry_list(name, type, entries, doc)
    lines = entries.flat_map do |entry|
      body = TRANSFORM_ENTRY_FIELDS.filter_map do |field|
        next unless entry.key?(field)

        "    #{field}: #{CoreDataGenerator.ts_flat(entry.fetch(field))},"
      end
      ["  {", *body, "  },"]
    end
    [CoreDataGenerator.ts_doc(doc), "export const #{name}: #{type} = [", *lines, "];"].join("\n")
  end

  TRANSFORM_ENTRY_FIELDS =
    %w[name rubyClass disposition carrier family defaultKeyword sources].freeze

  def emit_transform_tables_file(out_root, data)
    families = data[:get_class].filter_map { |row| row["family"] }.uniq.sort
    sections = [
      ts_header(<<~TEXT.chomp),
        The tables `Plurimath::UnicodeMath::Transform` resolves its nodes and
        symbols through.

        `unicode_math/transform.rb` resolves a captured name at RUNTIME —
        `Object.const_get("Plurimath::Math::Function::\#{capitalize(text)}")`
        (`utility.rb:139`) — and `Utility.symbols_class` looks a captured text up
        in a table reflected off every symbol class's `INPUT[:unicodemath]`.
        Neither has a TypeScript equivalent, so both are resolved here, through
        the gem, and emitted with what they reached.
        `src/formats/unicodemath/registry.ts` binds these to `core`
        constructors; nothing restates them.

        This is the FIRST transform slice, so the emitted set is what that slice
        consumes and no more. `Utility.get_table_class` has no table here: the
        table/matrix rules are deferred, and data nothing reads cannot be kept
        honest.
      TEXT
      [
        CoreDataGenerator.ts_doc(
          "How the census disposes of a resolved class — the same vocabulary\n" \
          "`src/formats/latex/generated/transform-tables.ts` uses. An `aliased`\n" \
          "class adds no field and no equality of its own, so the port carries\n" \
          "it as its carrier plus a name.",
        ),
        'export type UnicodemathTransformDisposition = "implemented" | "aliased";',
      ].join("\n"),
      [
        CoreDataGenerator.ts_doc(
          "Which Ruby `initialize` shape a `get_class` name resolves to,\n" \
          "measured off the runtime by `CorpusGenerator` (instantiate, read the\n" \
          "assigned ivars back, then re-verify parameter wiring with sentinel\n" \
          "arguments). Only `get_class` entries carry one: the font-style\n" \
          "classes sit outside that vocabulary and the transform constructs\n" \
          "them directly.",
        ),
        "export type UnicodemathTransformConstructorFamily =\n  | " \
        "#{families.map { |f| CoreDataGenerator.ts_string(f) }.join("\n  | ")};",
      ].join("\n"),
      [
        CoreDataGenerator.ts_doc(
          "One resolved name: the text as CAPTURED (the registry is keyed by it,\n" \
          "so nothing has to reimplement `capitalize`), the class the gem\n" \
          "reached, its census disposition, the implemented carrier the port\n" \
          "constructs, and — for `get_class` names — the measured constructor\n" \
          "family. `sources` names the grammar tags that can carry the text.",
        ),
        "export interface UnicodemathTransformClassEntry {",
        "  readonly name: string;",
        "  readonly rubyClass: string;",
        "  readonly disposition: UnicodemathTransformDisposition;",
        "  readonly carrier: string;",
        "  readonly family?: UnicodemathTransformConstructorFamily;",
        "  readonly defaultKeyword?: string | null;",
        "  readonly sources: readonly string[];",
        "}",
      ].join("\n"),
      ts_entry_list(
        "UNICODEMATH_TRANSFORM_GET_CLASS", "readonly UnicodemathTransformClassEntry[]",
        data[:get_class],
        "Every name `Utility.get_class` can receive from the UnicodeMath\n" \
        "transform that the gem can resolve, sorted by name.\n" \
        "\n" \
        "Derived from the two grammar tags that feed it — `unary_functions`\n" \
        "minus `UNDEF_UNARY_FUNCTIONS`, and `NARY_CLASSES.keys` — see\n" \
        "`get_class_sources` in the generator. The whole file has only those\n" \
        "two identifier shapes across its 18 `get_class` mentions, so this is\n" \
        "the transform's complete name space, not just the ported slice's.",
      ),
      ts_string_list(
        "UNICODEMATH_TRANSFORM_UNRESOLVED", data[:unresolved],
        "The reachable names `Utility.get_class` CANNOT resolve, measured by\n" \
        "running the lookup and catching `NameError`.\n" \
        "\n" \
        "Empty today. It is emitted anyway, because LaTeX's equivalent is not\n" \
        "empty (`Pr` has no `Math::Function::Pr` and `\\\\Pr_1` raises there), and\n" \
        "a name that stops resolving upstream has to become a registry MISS\n" \
        "here rather than a silent substitution.",
      ),
      ts_entry_list(
        "UNICODEMATH_TRANSFORM_FONT_STYLES", "readonly UnicodemathTransformClassEntry[]",
        data[:font_styles],
        "`Utility::FONT_STYLES` restricted to the texts the `font_class` tag can\n" \
        "carry — `FONTS_CLASSES` and `ALPHANUMERIC_FONTS_CLASSES`\n" \
        "(`constants_rules.rb:17` and `:80`) — sorted by name.\n" \
        "\n" \
        "`transform.rb:236` calls `.new` on the lookup with no nil guard, so a\n" \
        "text with no entry would raise `NoMethodError`. Generation asserts\n" \
        "there is none.\n" \
        "\n" \
        "`defaultKeyword` is what that ONE-argument call leaves in\n" \
        "`parameter_two`, measured per class by constructing one and reading the\n" \
        "ivar back. It is not derivable from the name: `Bold` defaults to\n" \
        "`\"bold\"`, `Normal` to `\"rm\"`, and six of the fourteen default to nil.",
      ),
      CoreDataGenerator.ts_tuple_map(
        "UNICODEMATH_SYMBOL_CLASS_INPUT", "ReadonlyMap<string, string>",
        data[:symbol_classes],
        doc: "`Utility.all_symbols_classes(:unicodemath)` — the table\n" \
             "`Utility.symbols_class(text, lang: :unicodemath)` looks a STRIPPED\n" \
             "text up in, as text -> symbol id.\n" \
             "\n" \
             "`symbols_hash` merged with `parens_hash`, parens last, so a text in\n" \
             "both halves resolves to the PAREN class;\n" \
             "`UNICODEMATH_SYMBOL_CLASS_OVERLAP` names those. Both halves are\n" \
             "String-keyed — they come from each class's `INPUT[:unicodemath]`\n" \
             "array — so unlike the LaTeX `symbols_constants` table this one\n" \
             "cannot collide and a Map is safe; generation asserts the merge is\n" \
             "the size of the union of its halves.\n" \
             "\n" \
             "A MISS is not an error: `symbols_class` falls back to\n" \
             "`Math::Symbols::Symbol.new(text)`, carrying the text itself.",
      ),
      ts_string_list(
        "UNICODEMATH_SYMBOL_CLASS_OVERLAP", data[:symbol_overlap],
        "The texts present in BOTH halves of\n" \
        "`all_symbols_classes(:unicodemath)`. The parens half is merged last and\n" \
        "wins each of them; emitted so the count is pinned and a silent change\n" \
        "to the merge order shows up as a diff.",
      ),
      CoreDataGenerator.ts_tuple_map(
        "UNICODEMATH_TRANSFORM_NAMED_SYMBOLS", "ReadonlyMap<string, string>",
        data[:named_symbols],
        doc: "The symbol classes the ported transform names as literals rather\n" \
             "than reaching through a table, as role -> symbol id.\n" \
             "\n" \
             "`Utility.valid_paren?` (`utility.rb:270-279`) asks whether a\n" \
             "`Fenced`'s parens are exactly `Paren::Lround` and `Paren::Rround`;\n" \
             "that answer is what decides whether `unfenced_value` unwraps it.\n" \
             "Emitted rather than spelled in TypeScript so an upstream rename is\n" \
             "a regeneration diff.",
      ),
      CoreDataGenerator.ts_tuple_map(
        "UNICODEMATH_NARY_CLASSES", "ReadonlyMap<string, string>", data[:nary_classes],
        doc: "`Constants::NARY_CLASSES`: the four n-ary names that resolve to a\n" \
             "dedicated `Math::Function` class, mapped to the entity that spells\n" \
             "them. The n-ary rules test membership by KEY and invert the hash to\n" \
             "recover a key from an entity, so both directions are read.",
      ),
      ts_string_list(
        "UNICODEMATH_BINARY_FUNCTIONS", data[:binary_functions],
        "`Constants::BINARY_FUNCTIONS`: the `class_name` values the sub- and\n" \
        "sup-script rules treat as \"a function still missing its argument\", so\n" \
        "the script fills `parameter_one`/`parameter_two` instead of wrapping.\n" \
        "Order is not semantic here (the transform only calls `include?`); the\n" \
        "gem's order is kept so a regeneration diff mirrors an upstream edit.",
      ),
      CoreDataGenerator.ts_tuple_map(
        "UNICODEMATH_MENCLOSE_FUNCTIONS", "ReadonlyMap<string, string>", data[:menclose],
        doc: "`Utility::UNICODEMATH_MENCLOSE_FUNCTIONS` (`utility.rb:111-122`):\n" \
             "the `unary_arg_functions` name -> the `Menclose` notation string\n" \
             "`transform.rb:1209` passes as `parameter_one`.\n" \
             "\n" \
             "A MISS yields Ruby nil, and `Menclose.new(nil, value)` is a legal\n" \
             "node, so this table is deliberately not exhaustive over the tag.",
      ),
      [
        CoreDataGenerator.ts_doc(
          "The classes the ported transform rules ask `is_a?` about, each with\n" \
          "the full set of classes that answer true — itself plus every\n" \
          "descendant, measured off the loaded class tree.\n" \
          "\n" \
          "`is_a?` is inheritance, not identity, and a draft carries only a node\n" \
          "kind and an alias basename. Enumerating the answer means an upstream\n" \
          "subclass shows up as a regenerated table rather than as a branch that\n" \
          "quietly stopped matching.",
        ),
        "export const UNICODEMATH_IS_A_CLASSES: ReadonlyMap<string, readonly string[]> = new Map([",
        *data[:is_a].flat_map do |key, family|
          ["  [", "    #{CoreDataGenerator.ts_string(key)},", "    [",
           *family.map { |name| "      #{CoreDataGenerator.ts_string(name)}," }, "    ],", "  ],"]
        end,
        "]);",
      ].join("\n"),
      CoreDataGenerator.ts_tuple_map(
        "UNICODEMATH_PRIMES_CONSTANTS", "ReadonlyMap<string, string>", data[:primes],
        doc: "`Utility.primes_constants` (`utility.rb:292-297`):\n" \
             "`Constants::PREFIXED_PRIMES` merged with `{ sprime: \"&#x27;\" }`,\n" \
             "as name -> entity.\n" \
             "\n" \
             "`Utility.base_is_prime?` reads it in the VALUE direction — `key(v)`\n" \
             "— to decide whether a `Power`'s exponent is a prime mark, which is\n" \
             "what turns `x'_1` into a `PowerBase` rather than a nested `Base`.",
      ),
    ]
    CoreDataGenerator.write_ts(File.join(out_root, "transform-tables.ts"), sections)
  end

  def emit_provenance_file(out_root, provenance)
    sections = [
      CoreDataGenerator.ts_doc(<<~TEXT.chomp),
        GENERATED FILE — do not edit, regenerate.

        Emitted by #{GENERATOR_PATH} from the Plurimath Ruby gem, the oracle
        (ARCHITECTURE.md §1).

        What every file under `#{OUT_REL}/` was generated from.

        Separate from the core, formatting, corpus and LaTeX provenance files
        because a separate generator wrote it: the UnicodeMath format module owns
        its own parser tables (§3 rules 1 and 3), and each generator records its
        own inputs (§7).

        `generator` names the script that was run; `generatorInputs` hashes every
        Ruby file whose bytes can change the tables, keyed by its
        repository-relative path — that script, plus the two generators it
        borrows emission, git and hashing helpers from. Hashing only the entry
        point would let a change to a shared file move a table while the
        recorded hash stayed identical.

        Otherwise deliberately path-free: dirty file lists would churn on every
        unrelated edit.
      TEXT
      [
        "export interface UnicodemathParserGeneratedProvenance {",
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
        "export const UNICODEMATH_PARSER_GENERATED_PROVENANCE: " \
        "UnicodemathParserGeneratedProvenance = {",
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

    assert_no_mixed_key_classes!
    assert_constant_inventory!
    tables = literal_tables
    fonts = unicoded_font_rows
    duplicates = duplicate_report(tables)
    markers = decimal_marker_rows
    transform = transform_data(gem_dir)
    provenance = build_provenance(gem_dir, dirty, options[:allow_dirty])

    written = [
      emit_tables_file(options[:out], tables, fonts, duplicates, markers),
      emit_transform_tables_file(options[:out], transform),
      emit_provenance_file(options[:out], provenance),
    ]
    written.sort.each { |path| puts "  #{relative(path)}" }
    puts "#{tables.length} tables, #{tables.values.sum(&:length)} entries verified by parse"
    puts "repeated-text tables: #{duplicates.map { |n, t, d, _| "#{n} #{t}/#{d}" }.join(', ')}"
    puts "unicoded fonts #{fonts.length}: " \
         "#{fonts.map { |font, entries| "#{font} #{entries.length}" }.join(', ')}"
    puts "decimal markers #{markers.length}: " \
         "#{markers.map { |raw, encoded| "#{raw.inspect} -> #{encoded.inspect}" }.join(', ')}"
    puts "get_class #{transform[:get_class].length} resolved, " \
         "#{transform[:unresolved].length} unresolvable; " \
         "font styles #{transform[:font_styles].length}; " \
         "symbols_class #{transform[:symbol_classes].length} entries " \
         "(#{transform[:symbol_overlap].length} carried by both halves)"
    puts "committable: #{provenance['committable']}"
    0
  end

  # Everything `emit_transform_tables_file` needs, measured in one place. The
  # census is built here rather than read from `corpus/census.yaml`: that file
  # is the corpus generator's output, and a generator that reads another
  # generator's artifact records the wrong provenance for it.
  def transform_data(gem_dir)
    # `descendants` only sees what is loaded, and the model namespaces are
    # autoloaded, so the census would otherwise be measured against a partial
    # class tree. `CorpusGenerator` does the same before it builds its census.
    CorpusGenerator.load_model_classes!(gem_dir)
    census_index = CorpusGenerator.build_census(gem_dir)
      .fetch("classes").to_h { |entry| [entry["name"], entry] }
    resolved, unresolved = get_class_rows(census_index)
    {
      get_class: resolved,
      unresolved: unresolved,
      font_styles: font_style_rows(census_index),
      symbol_classes: symbol_class_rows,
      symbol_overlap: symbol_class_overlap,
      named_symbols: named_symbol_rows,
      nary_classes: string_pairs(constants::NARY_CLASSES, "NARY_CLASSES"),
      binary_functions: constants::BINARY_FUNCTIONS.dup,
      menclose: string_pairs(
        Plurimath::Utility::UNICODEMATH_MENCLOSE_FUNCTIONS, "UNICODEMATH_MENCLOSE_FUNCTIONS"
      ),
      primes: string_pairs(Plurimath::Utility.primes_constants, "primes_constants"),
      is_a: is_a_rows(gem_dir),
    }
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    exit UnicodeMathParserDataGenerator.run(ARGV)
  rescue UnicodeMathParserDataGenerator::Error, CoreDataGenerator::Error,
         CorpusGenerator::Error => e
    warn "generate-unicodemath-parser-data: #{e.message}"
    exit 1
  end
end
