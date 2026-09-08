# frozen_string_literal: true

# Generates the constant tables the HTML *grammar* reads — the alternatives
# `Plurimath::Html::Parse` builds its rules from, consumed by
# `src/formats/html/grammar.ts`.
#
# `Html::Constants` holds three constants and the grammar reads all three, so
# nothing here is a judgement about what to leave out. What IS a judgement is
# which *projection* of each: `array_to_expression` (`html/parse.rb:133`) is
# called four times, at `:9`, `:21`, `:25` and `:29`, with `UNARY_CLASSES`,
# `PARENTHESIS.keys`, `PARENTHESIS.values` and `SUB_SUP_CLASSES.keys`. Four
# tables, three constants, and one projection deliberately left out:
# `SUB_SUP_CLASSES.values` is read by `html/utility.rb:12`, on the transform
# side, which this slice does not port.
#
# **Which of the two earlier collisions applies here: NEITHER, and both are
# re-checked on every run rather than assumed.**
#
#   * LaTeX's. `scripts/generate-latex-parser-data.rb` emits tuples because
#     `Latex::Constants.symbols_constants` merges a Symbol-keyed hash into a
#     String-keyed one, so nineteen texts appear twice and a Map keyed by the
#     text would delete one of each pair. `Html::Constants` has no such hash:
#     `PARENTHESIS` and `SUB_SUP_CLASSES` are both uniformly Symbol-keyed with
#     Symbol values, and no two keys of either collide under `to_s`.
#     `assert_no_mixed_key_classes!` re-establishes that.
#
#   * UnicodeMath's. `scripts/generate-unicodemath-parser-data.rb` emits ordered
#     arrays because nine of its `.values` tables repeat a text — named symbols
#     sharing a code point — so keying by the text deleted 28 alternatives.
#     That shape DOES exist in `Html::Constants`, and it is the reason the
#     projection list above is worth stating: `SUB_SUP_CLASSES.values` is eight
#     entries and four distinct (`prod` and `sum` three times each), because the
#     hash maps four spellings of the product sign and four of the summation
#     sign onto two class names. It is measured and emitted as
#     `HTML_REPEATED_TEXT_PROJECTIONS`, and `assert_no_repeated_texts!` proves
#     that no table the grammar actually reads repeats a text — so the day
#     upstream adds a repeat to one, or the transform slice reaches for
#     `.values`, this generator fails instead of quietly emitting a table an
#     ordered choice has already shortened.
#
# The emitted shape is an ordered array of strings either way. Order is
# behaviour: `array_to_expression` folds each array into a Parslet ordered
# choice with no longest-match backtracking, so `UNARY_CLASSES` must keep the
# gem's own order — it carries six prefix pairs (`sinh` before `sin`, and five
# more) and reversing one would make the longer name unreachable.
# `assert_no_shadowed_prefixes!` proves no table is already in that state.
#
# **The decimal marker is HTML's, not LaTeX's or UnicodeMath's, and this is the
# one place the three formats visibly disagree.** `decimal_marker`
# (`html/parse.rb:147`) is `str(Plurimath.configuration.decimal)` — the RAW
# marker. The other two match `Utility.string_to_html_entity(marker)` instead,
# because their parsers entity-encode the whole input before Parslet sees it
# (`latex/parser.rb:27`, `unicode_math/parser.rb:12`). `Html::Parser` has an
# encoding pass too, and it is the same composition LaTeX's is built from —
# `string_to_html_entity(html_entity_to_unicode(...))`, `html/parser.rb:29-31` —
# but it is applied only to substrings already matching `HTML_ENTITY`
# (`html/parser.rb:8`) rather than to the whole text, because encoding the whole
# text would turn every `<` into `&#x3c;` and there would be no tags left to
# parse. A bare code point therefore survives it: measured, `"٫"` (`ar`'s
# marker) normalises to itself, where LaTeX's pass turns it into `&#x66b;`.
# `HTML_RAW_DECIMAL_MARKERS` carries the markers, and `assert_raw_markers!`
# proves for each one that it survives normalisation unchanged, that
# `1<marker>5` is one number under its own locale, and that it is NOT one under
# the other locales — HTML's marker is exclusive, as LaTeX's is and
# UnicodeMath's is not.
#
# Layer rules: this output is the HTML format module's own data, under that
# module's own directory (ARCHITECTURE.md §3 rules 1 and 3). It is a separate
# generator from scripts/generate-corpus.rb, and lives beside the module rather
# than under `src/generated/html/`, because that directory belongs to the corpus
# generator: `src/generated/provenance.ts` states it records what every file
# under `src/generated/` was generated from, and a second generator writing
# there would make that sentence false.
#
# Usage, from the plurimath-ts repository root:
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile \
#     mise x -- bundle exec ruby scripts/generate-html-parser-data.rb
#
# Options:
#   --gem PATH        gem checkout to treat as the oracle
#                     (default: the checkout bundler resolved `plurimath` from)
#   --out PATH        output root (default: <repo>/src/formats/html/generated)
#   --allow-dirty     generate from a dirty checkout; the output is marked
#                     non-committable in the provenance file (§7)
#   --help
#
# Outputs:
#   src/formats/html/generated/parser-tables.ts  the grammar's tables
#   src/formats/html/generated/provenance.ts     what they came from
#
# The generator is deterministic: two runs over the same oracle produce
# byte-identical output. No timestamps, no absolute paths; every table keeps the
# gem's own order.

require_relative "generate-core-data"

module HtmlParserDataGenerator
  class Error < StandardError; end

  REPO_ROOT = File.expand_path("..", __dir__)
  GENERATOR_PATH = "scripts/generate-html-parser-data.rb"
  OUT_REL = "src/formats/html/generated"

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
  #   source:  the `Constants` expression, as written in `html/parse.rb`
  #   line:    the `array_to_expression` call site
  #   rule:    the `Html::Parse` rule that call builds
  #   tag:     the `.as(...)` name every alternative of that rule carries
  #
  # Every entry of every table is parsed through its own rule before emission,
  # and the resulting tree is checked to be a single node under `tag` — so an
  # entry the grammar cannot reach, or a tag that moved upstream, fails
  # generation rather than shipping as a dead alternative or a mislabelled tree.
  TABLES = [
    ["HTML_UNARY_CLASSES", "UNARY_CLASSES", 9, :unary, "unary"],
    ["HTML_LPAREN", "PARENTHESIS.keys", 21, :lparen, "lparen"],
    ["HTML_RPAREN", "PARENTHESIS.values", 25, :rparen, "rparen"],
    ["HTML_SUB_SUP_CLASSES", "SUB_SUP_CLASSES.keys", 29, :sub_sup, "sum_prod"],
  ].freeze

  # Projections of `Html::Constants` the grammar never reads, and who does read
  # them. Named so the emitted set is a measured subset rather than an
  # unexplained one; `assert_projection_inventory!` proves the union covers
  # every constant.
  UNEMITTED_PROJECTIONS = {
    "SUB_SUP_CLASSES.values" => "html/utility.rb:12 (`Utility.sub_sup_method?`), transform side",
  }.freeze

  # The `Constants` each emitted or named projection belongs to. Every constant
  # must appear, or the inventory assertion fails.
  PROJECTION_OWNERS = %w[UNARY_CLASSES PARENTHESIS SUB_SUP_CLASSES].freeze

  module_function

  # --- measurement ---------------------------------------------------------

  def constants
    Plurimath::Html::Constants
  end

  # One parser instance for every rule probe. Parslet memoizes a rule's atom on
  # the instance the first time it is used, so a fresh parser per probe would
  # rebuild every alternation.
  def parser
    @parser ||= Plurimath::Html::Parse.new
  end

  # Parses `text` through one rule of the gem's own grammar, with Parslet's
  # `consume_all`, and answers the tree or nil.
  def rule_parse(text, rule, on: parser)
    on.public_send(rule).parse(text)
  rescue Parslet::ParseFailed
    nil
  end

  # LaTeX's collision, refuted rather than assumed.
  #
  # The LaTeX tables need tuples because one hash there carries both Symbol and
  # String keys, and in Ruby those never collide. No hash here does. If upstream
  # ever introduces one, a plain `to_s` projection would collapse the pair and
  # delete a live alternative, so this refuses rather than emitting it.
  def assert_no_mixed_key_classes!
    constants.constants.sort.each do |name|
      value = constants.const_get(name)
      next unless value.is_a?(::Hash)

      classes = value.keys.map(&:class).uniq
      unless classes == [::Symbol]
        raise Error, "Html::Constants::#{name} is keyed by " \
                     "#{classes.map(&:name).join(' + ')}, not by Symbol alone; " \
                     "the emitted array shape assumes a single key class"
      end

      collisions = value.keys.map(&:to_s).tally.select { |_, count| count > 1 }.keys
      next if collisions.empty?

      raise Error, "Html::Constants::#{name} has keys that collide under to_s " \
                   "(#{collisions.join(', ')}); projecting them onto Strings " \
                   "would drop an alternative"
    end
  end

  # UnicodeMath's collision, refuted for the tables the grammar reads.
  #
  # There it is tolerated and reported, because the repeats are the gem's own
  # and dropping them would make the emitted array something other than the
  # gem's. Here there are none to tolerate, so a repeat appearing upstream is a
  # change of shape and stops the run: it would mean a grammar alternation whose
  # later entry Parslet's ordered `|` can never reach.
  def assert_no_repeated_texts!(tables)
    tables.each do |name, texts|
      repeats = texts.tally.select { |_, count| count > 1 }
      next if repeats.empty?

      raise Error, "#{name} repeats #{repeats.keys.map(&:inspect).join(', ')}; every table " \
                   "the HTML grammar reads was distinct when this port was written, and a " \
                   "repeat is an alternative the ordered choice can no longer reach"
    end
  end

  # Order is behaviour, so the one way order can already be wrong is measured.
  #
  # In an ordered choice with no longest-match backtracking, an entry that is a
  # proper prefix of a LATER entry shadows it completely. `UNARY_CLASSES` is
  # written longest-first for exactly this reason and carries six such pairs;
  # this proves none of them is the wrong way round, in any table.
  def shadowed_prefixes(texts)
    texts.each_with_index.flat_map do |shorter, i|
      texts.each_with_index.filter_map do |longer, j|
        [shorter, longer] if j > i && longer.start_with?(shorter) && longer != shorter
      end
    end
  end

  def assert_no_shadowed_prefixes!(tables)
    tables.each do |name, texts|
      shadowed = shadowed_prefixes(texts)
      next if shadowed.empty?

      raise Error, "#{name}: #{shadowed.map { |a, b| "#{a.inspect} shadows #{b.inspect}" }
        .join(', ')}; the earlier entry matches first and the later one is dead"
    end
  end

  # Every `Constants` entry is either projected into an emitted table or named
  # unemitted, so an upstream addition is a generator failure rather than a
  # table the port silently lacks.
  def assert_projection_inventory!
    named = (TABLES.map { |_, source, _, _, _| source } + UNEMITTED_PROJECTIONS.keys)
    owners = named.map { |source| source[/\A[A-Z][A-Z_]+/] }.uniq.sort
    unless owners == PROJECTION_OWNERS.sort
      raise Error, "the projection list covers #{owners.join(', ')}, " \
                   "but PROJECTION_OWNERS names #{PROJECTION_OWNERS.sort.join(', ')}"
    end

    actual = constants.constants.map(&:to_s).sort
    return if PROJECTION_OWNERS.sort == actual

    raise Error, <<~MESSAGE
      Html::Constants changed shape.
        projected but absent upstream: #{(PROJECTION_OWNERS.sort - actual).join(', ')}
        present upstream but unnamed:  #{(actual - PROJECTION_OWNERS.sort).join(', ')}
    MESSAGE
  end

  # A `Constants` array or hash key/value list, projected onto Strings, with
  # every entry parsed back through the rule it builds and its tag checked.
  def literal_list(name, values, rule, tag)
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

    texts.each do |text|
      tree = rule_parse(text, rule)
      if tree.nil?
        raise Error, "#{name}: the gem's own `#{rule}` rule refuses #{text.inspect}, " \
                     "so the projection onto Strings is wrong"
      end
      next if tree.is_a?(::Hash) && tree.keys.map(&:to_s) == [tag] &&
              tree.values.first.to_s == text

      raise Error, "#{name}: `#{rule}` parses #{text.inspect} to #{tree.inspect}, " \
                   "not to a single #{tag.inspect} node carrying that text"
    end
    texts
  end

  def literal_tables
    TABLES.to_h do |name, source, _line, rule, tag|
      # `module_eval` rather than `instance_eval`: the source strings are written
      # as they appear in `html/parse.rb`, so `PARENTHESIS` must resolve against
      # the module's own constants rather than its singleton class.
      [name, literal_list(name, constants.module_eval(source), rule, tag)]
    end
  end

  # The projections the grammar does not read, with their repeat counts. Emitted
  # as the evidence behind the array-not-Map decision: HTML's grammar tables are
  # repeat-free, but the constant that would collapse under a keyed shape does
  # exist, one projection away.
  def unemitted_projection_report
    UNEMITTED_PROJECTIONS.map do |source, owner|
      texts = constants.module_eval(source).map(&:to_s)
      repeats = texts.tally.select { |_, count| count > 1 }
      [source, texts.length, texts.uniq.length, repeats.values.sum - repeats.length, owner]
    end
  end

  # --- the entity alternation ----------------------------------------------

  # `html_entity` (`html/parse.rb:165-169`) spelled with `repeat(1)` where the
  # other two formats spell theirs `repeat`. The gem is inconsistent between its
  # own formats and HTML is the strict one, so the port has to say `repeat(1)`
  # and the difference is proved here rather than described.
  #
  # `symbol_text_or_tag` is the probe rather than `html_entity` itself, because
  # `html_entity` is a plain method and not a rule: it has no `.as(:symbol)` and
  # its failure is only observable through the alternation that wraps it.
  ENTITY_ACCEPTED = %w[&#x20; &#xA0; &#32; &a; &ab1; &A;].freeze
  ENTITY_REFUSED = %w[&#x; &#; &;].freeze

  def assert_entity_repeat_minimum!
    ENTITY_ACCEPTED.each do |text|
      tree = rule_parse(text, :symbol_text_or_tag)
      next if tree == { symbol: text }

      raise Error, "`symbol_text_or_tag` gives #{text.inspect} as #{tree.inspect}, " \
                   "not as one :symbol node; the entity alternation moved"
    end

    ENTITY_REFUSED.each do |text|
      tree = rule_parse(text, :symbol_text_or_tag)
      next if tree.nil?

      raise Error, "`symbol_text_or_tag` now accepts #{text.inspect} as #{tree.inspect}; " \
                   "`html_entity`'s repeat(1) (`html/parse.rb:166-167`) has become repeat"
    end

    assert_other_formats_accept_empty_entity!
  end

  # The contrast the comment above rests on, so it cannot rot into a false
  # claim: both other formats DO accept an empty hex body.
  def assert_other_formats_accept_empty_entity!
    latex = rule_parse("&#x;", :symbol_class_commands, on: Plurimath::Latex::Parse.new)
    unless latex == { unicode_symbols: "&#x;" }
      raise Error, "latex/parse.rb:93 no longer reads \"&#x;\" as one :unicode_symbols node " \
                   "(#{latex.inspect}); the HTML-is-stricter claim needs re-measuring"
    end

    unicodemath = rule_parse("&#x;", :unicode, on: Plurimath::UnicodeMath::Parse.new)
    return unless unicodemath.nil?

    raise Error, "unicode_math/parse.rb:30 no longer accepts \"&#x;\"; " \
                 "the HTML-is-stricter claim needs re-measuring"
  end

  # --- the decimal marker --------------------------------------------------

  # Every decimal marker the gem's locale table yields, proved raw and
  # exclusive. Raw: `Html::Parser`'s entity pass leaves it alone, so
  # `decimal_marker` (`html/parse.rb:147`) matches the marker itself rather than
  # an encoding of it. Exclusive: under one locale's marker, the other markers
  # are not decimal points — which is LaTeX's behaviour and not UnicodeMath's,
  # whose `op_decimal` hard-codes `,` and `.` alongside the configured one.
  def raw_decimal_markers
    locales = Plurimath::Formatter::SupportedLocales::LOCALES
    markers = locales.values.filter_map { |row| row[:decimal] }.uniq
    markers |= [Plurimath::Configuration::DEFAULT_DECIMAL]
    if markers.empty?
      raise Error, "the gem's locale table yielded no decimal markers"
    end

    markers.sort.each { |marker| assert_raw_marker!(locales, marker, markers) }
    markers.sort
  end

  def assert_raw_marker!(locales, marker, all_markers)
    normalized = Plurimath::Html::Parser.new(+marker).send(:normalized_text)
    unless normalized == marker
      raise Error, "`Html::Parser` normalises #{marker.inspect} to #{normalized.inspect}; " \
                   "the grammar's raw `str(configuration.decimal)` would never match it"
    end

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
      # which is also why `Html::Parser#parse` builds a new `Parse` for every
      # call.
      fresh = Plurimath::Html::Parse.new
      all_markers.each do |probe|
        tree = rule_parse("1#{probe}5", :symbol_text_or_tag, on: fresh)
        wanted = probe == marker ? { number: "1#{probe}5" } : nil
        next if tree == wanted

        raise Error, "under #{locale.inspect} (marker #{marker.inspect}), " \
                     "#{"1#{probe}5".inspect} reads as #{tree.inspect}, not #{wanted.inspect}; " \
                     "HTML's decimal marker is no longer exclusive"
      end
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

  # Wrapped by hand rather than by a formatter: `write_ts` refuses any line over
  # Biome's print width, and a doc comment is a line like any other.
  def table_doc(source, line, rule, tag, texts)
    lines = [
      "`Constants::#{source}` -> `#{rule}` (`html/parse.rb:#{line}`),",
      "an ordered choice of `str(text).as(:#{tag})`.",
      "",
      "#{texts.length} entries, all distinct.",
    ]
    pairs = shadow_safe_pairs(texts)
    unless pairs.empty?
      lines << "#{pairs.length} of them are prefix pairs written longest-first"
      lines << "(#{pairs.take(2).map { |a, b| "#{b} before #{a}" }.join(', ')}#{
        pairs.length > 2 ? ', ...' : ''}), so the order is behaviour."
    end
    lines.join("\n")
  end

  # The prefix pairs that are the right way round: a longer entry ahead of the
  # shorter one it starts with. `assert_no_shadowed_prefixes!` proves there are
  # no others.
  def shadow_safe_pairs(texts)
    texts.each_with_index.flat_map do |longer, i|
      texts.each_with_index.filter_map do |shorter, j|
        [shorter, longer] if j > i && longer.start_with?(shorter) && longer != shorter
      end
    end
  end

  def emit_tables_file(out_root, tables, projections, markers)
    sections = [
      ts_header(<<~TEXT.chomp),
        The constant tables `Plurimath::Html::Parse` builds its rules from.

        Order is behaviour. `array_to_expression` (`html/parse.rb:133`) folds each
        table into a Parslet ordered choice, and Parslet's `|` has no longest-match
        backtracking — so these arrays keep the gem's own order and are never
        sorted here. Every entry was parsed back through the gem's own rule, and
        its tag checked, before emission.

        **Arrays, never Maps — and here that is a guard rather than a necessity.**
        Neither collision the two earlier formats hit applies to these four tables:
        no `Html::Constants` hash mixes Symbol and String keys as LaTeX's
        `symbols_constants` does, and no table below repeats a text as nine of
        UnicodeMath's `.values` tables do. Both are re-checked on every run. What
        does repeat is one projection the grammar never reads — see
        `HTML_REPEATED_TEXT_PROJECTIONS`.
      TEXT
      *TABLES.map do |name, source, line, rule, tag|
        CoreDataGenerator.ts_const(
          name, "readonly string[]", tables.fetch(name),
          doc: table_doc(source, line, rule, tag, tables.fetch(name))
        )
      end,
      [
        CoreDataGenerator.ts_doc(
          "Projections of `Html::Constants` the grammar does NOT read, as\n" \
          "[projection, entries, distinct, unreachable repeats, who reads it].\n" \
          "\n" \
          "Emitted so the array-not-Map decision above carries its own evidence.\n" \
          "The UnicodeMath tables are ordered arrays because keying them by text\n" \
          "would have deleted 28 alternatives; the HTML tables cannot collapse\n" \
          "that way, but the shape that would is one projection away, and this\n" \
          "row measures it. `test/formats/html/parser-tables.spec.ts` asserts that\n" \
          "no emitted table name appears here.",
        ),
        "export const HTML_REPEATED_TEXT_PROJECTIONS: ReadonlyArray<\n" \
        "  readonly [projection: string, entries: number, distinct: number, " \
        "repeats: number, readBy: string]\n" \
        "> = [",
        *projections.flat_map do |source, total, distinct, repeats, owner|
          fields = [
            CoreDataGenerator.ts_string(source), total.to_s, distinct.to_s, repeats.to_s,
            CoreDataGenerator.ts_string(owner)
          ]
          # Biome collapses a row that fits its print width and expands one that
          # does not, so the emitter makes the same call.
          flat = "  [#{fields.join(', ')}],"
          next [flat] if flat.length <= 100

          ["  [", *fields.map { |field| "    #{field}," }, "  ],"]
        end,
        "];",
      ].join("\n"),
      CoreDataGenerator.ts_const(
        "HTML_RAW_DECIMAL_MARKERS", "readonly string[]", markers,
        doc: "Every decimal marker the gem's locale table yields, which\n" \
             "`decimal_marker` (`html/parse.rb:147`) matches **raw**.\n" \
             "\n" \
             "There is no encoded form to look up, which is what makes this an\n" \
             "array where LaTeX and UnicodeMath both emit a Map. Their parsers\n" \
             "entity-encode the whole input before Parslet sees it, so their\n" \
             "grammars match `&#x66b;` where the user typed U+066B.\n" \
             "`Html::Parser` (`html/parser.rb:28`) encodes only substrings that\n" \
             "already look like entities — it has to, or `<` would become\n" \
             "`&#x3c;` and no tag would survive — so a bare marker reaches the\n" \
             "grammar unchanged. Proved per marker on every run, together with\n" \
             "the exclusivity LaTeX shares and UnicodeMath does not: under one\n" \
             "locale's marker the others are not decimal points."
      ),
    ]
    CoreDataGenerator.write_ts(File.join(out_root, "parser-tables.ts"), sections)
  end

  def emit_provenance_file(out_root, provenance)
    sections = [
      CoreDataGenerator.ts_doc(<<~TEXT.chomp),
        GENERATED FILE — do not edit, regenerate.

        Emitted by #{GENERATOR_PATH} from the Plurimath Ruby gem, the oracle
        (ARCHITECTURE.md §1).

        What every file under `#{OUT_REL}/` was generated from.

        Separate from the core, formatting, corpus, LaTeX and UnicodeMath
        provenance files because a separate generator wrote it: the HTML format
        module owns its own parser tables (§3 rules 1 and 3), and each generator
        records its own inputs (§7).

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
        "export interface HtmlParserGeneratedProvenance {",
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
        "export const HTML_PARSER_GENERATED_PROVENANCE: HtmlParserGeneratedProvenance = {",
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
    assert_projection_inventory!
    tables = literal_tables
    assert_no_repeated_texts!(tables)
    assert_no_shadowed_prefixes!(tables)
    assert_entity_repeat_minimum!
    projections = unemitted_projection_report
    markers = raw_decimal_markers
    provenance = build_provenance(gem_dir, dirty, options[:allow_dirty])

    written = [
      emit_tables_file(options[:out], tables, projections, markers),
      emit_provenance_file(options[:out], provenance),
    ]
    written.sort.each { |path| puts "  #{relative(path)}" }
    puts "#{tables.length} tables, #{tables.values.sum(&:length)} entries verified by parse"
    puts "no mixed key classes, no repeated text in any emitted table"
    puts "unemitted projections: " \
         "#{projections.map { |s, t, d, _, _| "#{s} #{t}/#{d}" }.join(', ')}"
    puts "raw decimal markers #{markers.length}: #{markers.map(&:inspect).join(', ')}"
    puts "committable: #{provenance['committable']}"
    0
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    exit HtmlParserDataGenerator.run(ARGV)
  rescue HtmlParserDataGenerator::Error, CoreDataGenerator::Error,
         CorpusGenerator::Error => e
    warn "generate-html-parser-data: #{e.message}"
    exit 1
  end
end
