# frozen_string_literal: true

# Generates the constant tables the LaTeX *grammar* reads — the alternatives
# `Plurimath::Latex::Parse` builds its rules from, consumed by
# `src/formats/latex/grammar.ts`.
#
# Two halves of `Latex::Constants` reach the grammar and both are emitted here:
#
#   1. Seven hand-written tables (187 entries between them). Small, but their
#      order is behaviour: `arr_to_expression` (`latex/parse.rb:196`) folds each
#      into a Parslet ordered choice with no longest-match backtracking, which
#      is why `MATH_OPERATORS` is written longest-first by hand — `ln` ahead of
#      `liminf` would shadow it.
#   2. `Constants.symbols_constants`, which is *derived*: it merges the
#      hand-written `SYMBOLS` into a table reflected off every loaded
#      `Math::Symbols::Symbol` descendant's `INPUT[:latex]` array, then sorts it
#      by descending key length. There is no TypeScript equivalent of that
#      reflection, and the result is thousands of entries, so it is emitted
#      rather than re-derived.
#
# **The collision this file exists to make impossible.** `symbols_constants` is
# `SYMBOLS.merge(symbols_hash)`: `SYMBOLS` has Symbol keys and `symbols_hash`
# String keys, and in Ruby those never collide. Nineteen texts are therefore
# present *twice*, once as a Symbol mapping to `:operant` and once as a String
# mapping to `:symbols` — and `dynamic_rules` (`latex/parse.rb:221`) gives the
# two kinds different grammars, so both alternatives are live. A JavaScript
# object or `Map` keyed by the text would silently keep one and delete the
# other. The emitted shape is therefore an **ordered array of tuples**, which
# cannot collapse, and the nineteen texts are emitted again as an explicit list
# so a test can prove both entries survived. Every one of them is verified
# through a live parse here before emission.
#
# Layer rules: this output is the LaTeX format module's own data, under that
# module's own directory (ARCHITECTURE.md §3 rules 1 and 3). It is a separate
# generator from scripts/generate-corpus.rb, and lives beside the module rather
# than under `src/generated/latex/`, because that directory belongs to the
# corpus generator: `src/generated/provenance.ts` states it records what every
# file under `src/generated/` was generated from, and a second generator
# writing there would make that sentence false. Consolidating the two is a
# rename, and belongs in a change that can regenerate the corpus generator's
# outputs in the same commit.
#
# Usage, from the plurimath-ts repository root:
#
#   BUNDLE_GEMFILE=/path/to/plurimath/Gemfile \
#     mise x -- bundle exec ruby scripts/generate-latex-parser-data.rb
#
# Options:
#   --gem PATH        gem checkout to treat as the oracle
#                     (default: the checkout bundler resolved `plurimath` from)
#   --out PATH        output root (default: <repo>/src/formats/latex/generated)
#   --allow-dirty     generate from a dirty checkout; the output is marked
#                     non-committable in the provenance file (§7)
#   --help
#
# Outputs:
#   src/formats/latex/generated/parser-tables.ts  the grammar's constant tables
#   src/formats/latex/generated/provenance.ts     what they were generated from
#
# The generator is deterministic: two runs over the same oracle produce
# byte-identical output. No timestamps, no absolute paths; every table keeps
# the gem's own order, because that order is the grammar's ordered choice.

require_relative "generate-core-data"

module LatexParserDataGenerator
  class Error < StandardError; end

  REPO_ROOT = File.expand_path("..", __dir__)
  GENERATOR_PATH = "scripts/generate-latex-parser-data.rb"
  OUT_REL = "src/formats/latex/generated"

  # Every file whose bytes can change what this generator emits: itself, plus
  # the two generators it borrows TypeScript emission, provenance, git and
  # hashing helpers from. Hashing only the entry point would let a change to a
  # shared file move a table while the recorded hash stayed identical.
  GENERATOR_INPUT_PATHS = [
    GENERATOR_PATH,
    CoreDataGenerator::GENERATOR_PATH,
    CorpusGenerator::GENERATOR_PATH,
  ].freeze

  # Table name -> the `Latex::Parse` rule `arr_to_expression` builds from it.
  # Every entry of every table is parsed through its own rule before emission,
  # so an entry the grammar cannot actually reach fails generation rather than
  # shipping as a dead alternative.
  #
  # `right_parens` is deliberately absent: `latex/parse.rb:62` builds it from
  # `LEFT_RIGHT_PARENTHESIS.keys`, the same array `left_parens` uses, so the two
  # rules share one emitted table.
  RULE_FOR_TABLE = {
    "numericValues" => :numeric_values,
    "underoverClasses" => :underover_classes,
    "mathOperators" => :math_operators_classes,
    "lparen" => :lparen,
    "rparen" => :rparen,
    "leftRightParens" => :left_parens,
    "environments" => :environment,
  }.freeze

  # The kind every `symbols_constants` entry whose text is also an `:operant`
  # entry carries, and the order the two appear in. Measured, not assumed: the
  # String (`:symbols`) entry sorts ahead of the Symbol (`:operant`) one.
  COLLIDING_KINDS = %w[symbols operant].freeze

  # `\;` never reaches the symbol alternation: `symbol_class_commands`
  # (`latex/parse.rb:94`) matches it as `:three_per_em_space` two alternatives
  # earlier. Measured, and named here so the collision check below can assert
  # the *other* eighteen behave identically instead of quietly skipping this one.
  SLASH_CLAIMED_EARLIER = { ";" => "three_per_em_space" }.freeze

  module_function

  # --- measurement ---------------------------------------------------------

  def constants
    Plurimath::Latex::Constants
  end

  # One parser instance for every rule probe. `arr_to_expression` and
  # `hash_to_expression` memoize into class variables, so a fresh instance per
  # probe would not rebuild anything anyway — but it would rebuild the *rule*
  # entities, and thousands of those are the slow part.
  def parser
    @parser ||= Plurimath::Latex::Parse.new
  end

  # Parses `text` through one rule of the gem's own grammar, with Parslet's
  # `consume_all`, and answers the tree or nil.
  def rule_parse(text, rule, on: parser)
    on.public_send(rule).parse(text)
  rescue Parslet::ParseFailed
    nil
  end

  # A one-key Parslet tree flattened to `[key, text]`, or nil.
  #
  # Compared as Strings rather than by `==` on the tree, because a
  # `Parslet::Slice` compares equal to a String only when it is the receiver —
  # and `Hash#==` does not promise which side it puts first.
  def leaf(tree)
    return nil unless tree.is_a?(::Hash) && tree.length == 1

    key, value = tree.first
    return nil unless value.is_a?(::Parslet::Slice)

    [key.to_s, value.to_s]
  end

  # A `Latex::Constants` array or hash-key list, projected onto Strings.
  #
  # `LEFT_RIGHT_PARENTHESIS` and `MATRICES` are keyed by Symbol and
  # `arr_to_expression` passes those straight to Parslet's `str`, which calls
  # `to_s`. That projection is asserted rather than assumed: every emitted
  # entry is parsed back through the rule it builds.
  def literal_list(name, values, rule)
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
      next unless rule_parse(text, rule).nil?

      raise Error, "#{name}: the gem's own `#{rule}` rule refuses #{text.inspect}, " \
                   "so the projection onto Strings is wrong"
    end
    texts
  end

  def literal_tables
    parens = constants.parenthesis
    unless parens.is_a?(::Hash) && !parens.empty?
      raise Error, "Constants.parenthesis is #{parens.class}; expected a non-empty Hash"
    end

    sources = {
      "numericValues" => constants::NUMERIC_VALUES,
      "underoverClasses" => constants::UNDEROVER_CLASSES,
      "mathOperators" => constants::MATH_OPERATORS,
      "lparen" => parens.keys,
      "rparen" => parens.values.flatten,
      "leftRightParens" => constants::LEFT_RIGHT_PARENTHESIS.keys,
      "environments" => constants::MATRICES.keys,
    }
    tables = sources.to_h do |name, values|
      [name, literal_list(name, values, RULE_FOR_TABLE.fetch(name))]
    end
    assert_left_right_parens_shared!(tables.fetch("leftRightParens"))
    assert_ordered_choice_reachable!(tables)
    tables
  end

  # `left_parens` and `right_parens` are built from the same array
  # (`latex/parse.rb:58` and `:62`), which reads like a copy-paste slip and is
  # not one: the hash maps delimiter token -> HTML entity, and both halves of a
  # pair are keys. Checked rather than argued.
  def assert_left_right_parens_shared!(texts)
    texts.each do |text|
      next unless rule_parse(text, :right_parens).nil?

      raise Error, "`right_parens` refuses #{text.inspect}, so it is not built " \
                   "from LEFT_RIGHT_PARENTHESIS.keys after all"
    end
  end

  # A repeated entry in an ordered choice is unreachable after the first, so a
  # duplicate is either dead weight or a sign the table changed shape. `rparen`
  # is the one table that genuinely repeats — it is `Hash#values.flatten`, and
  # several opening delimiters share a closing list — so its duplicates are
  # counted and reported rather than refused.
  def assert_ordered_choice_reachable!(tables)
    tables.each do |name, texts|
      duplicates = texts.tally.select { |_, count| count > 1 }.keys
      next if duplicates.empty?
      next if name == "rparen"

      raise Error, "#{name} repeats #{duplicates.join(', ')}; an ordered choice " \
                   "would never reach the second one"
    end
  end

  # --- symbols_constants ---------------------------------------------------

  # `Constants.symbols_constants`, as ordered [text, kind] pairs.
  #
  # Ruby's `sort_by { -length }` is not a stable sort, so entries of equal
  # length could in principle be ordered differently by a different
  # implementation. That is inert for every pair but the nineteen duplicated
  # texts — two *distinct* literals of the same length can never both match at
  # one position — and the duplicated ones are checked by parse below, in both
  # spellings, so the emitted order is evidence rather than an assumption.
  def symbol_constant_rows
    table = constants.symbols_constants
    unless table.is_a?(::Hash) && !table.empty?
      raise Error, "Constants.symbols_constants is #{table.class}; expected a non-empty Hash"
    end

    rows = table.map { |key, kind| [key.to_s, kind.to_s] }
    assert_length_ordered!(rows)
    assert_kinds_reachable!(rows)
    rows
  end

  # `reverse_sort_hash` (`latex/constants.rb:242`) sorts by descending key
  # length so a longer token wins the ordered choice — `\lim` must not shadow
  # `\liminf`. If that ever stops holding, the emitted alternation is wrong in a
  # way no shape check would catch.
  def assert_length_ordered!(rows)
    rows.each_cons(2) do |(before, _), (after, _)|
      next if before.length >= after.length

      raise Error, "symbols_constants is not ordered by descending key length " \
                   "(#{before.inspect} before #{after.inspect}); the ordered " \
                   "choice would let a short token shadow a longer one"
    end
  end

  # `dynamic_rules` (`latex/parse.rb:221`) is a `case` with no `else`: an
  # unhandled kind returns nil and the gem's own `hash_to_expression` would
  # raise on it. Every kind present is put through it, so a new upstream kind
  # fails generation here rather than becoming a missing branch in the port.
  def assert_kinds_reachable!(rows)
    rows.map(&:last).uniq.sort.each do |kind|
      atom = parser.dynamic_rules("zzprobezz", kind.to_sym)
      next unless atom.nil?

      raise Error, "`dynamic_rules` has no branch for kind #{kind.inspect}; " \
                   "the gem would raise building its own alternation"
    end
  end

  # The texts `symbols_constants` holds twice — as a Symbol and as a String.
  #
  # Each is verified by parse, in both spellings, because the emitted list is
  # the evidence a reader is asked to trust: the bare text must parse as
  # `:operant` and the backslashed text as `:symbols`. `\;` is the one
  # exception and is named in `SLASH_CLAIMED_EARLIER`, not skipped.
  def collision_texts(rows)
    counts = rows.map(&:first).tally
    texts = counts.select { |_, count| count > 1 }.keys
    if texts.empty?
      raise Error, "no text appears twice in symbols_constants; either the gem " \
                   "stopped merging Symbol and String keys, or the projection " \
                   "onto Strings already collapsed them"
    end

    texts.each do |text|
      kinds = rows.select { |candidate, _| candidate == text }.map(&:last)
      unless kinds == COLLIDING_KINDS
        raise Error, "#{text.inspect} appears #{kinds.length} times as " \
                     "#{kinds.inspect}; expected #{COLLIDING_KINDS.inspect}"
      end

      verify_collision!(text)
    end
    texts.sort
  end

  def verify_collision!(text)
    bare = leaf(rule_parse(text, :symbol_class_commands))
    unless bare == ["operant", text]
      raise Error, "#{text.inspect} parses as #{bare.inspect}, not as an operant; " \
                   "the bare alternative the `:operant` entry contributes is gone"
    end

    slashed = leaf(rule_parse("\\#{text}", :symbol_class_commands))
    expected = SLASH_CLAIMED_EARLIER.fetch(text, "symbols")
    unless slashed&.first == expected
      raise Error, "the backslashed #{text.inspect} parses as #{slashed.inspect}, " \
                   "not as #{expected.inspect}"
    end
  end

  # --- the decimal marker --------------------------------------------------

  # `decimal_marker` (`latex/parse.rb:205`) does not match the configured
  # marker: it matches `Utility.string_to_html_entity(marker)`, because
  # `Latex::Parser#pre_processing` entity-encodes the input before Parslet sees
  # it. For `.` and `,` that is the character itself; for `ar`/`fa`'s U+066B it
  # is the seven characters `&#x66b;`.
  #
  # Emitted as raw marker -> encoded marker so the grammar never has to
  # reimplement htmlentities' encoder for the one string it needs it for. The
  # keys are exactly the markers `src/formatting` can hand it.
  def decimal_marker_rows
    locales = Plurimath::Formatter::SupportedLocales::LOCALES
    markers = locales.values.filter_map { |row| row[:decimal] }.uniq
    markers |= [Plurimath::Configuration::DEFAULT_DECIMAL]
    if markers.empty?
      raise Error, "the gem's locale table yielded no decimal markers"
    end

    rows = markers.sort.map { |marker| [marker, Plurimath::Utility.string_to_html_entity(+marker)] }
    rows.each { |marker, encoded| verify_marker!(locales, marker, encoded, rows) }
    rows
  end

  def verify_marker!(locales, marker, encoded, rows)
    locale = locales.find { |_, row| row[:decimal] == marker }&.first
    locale ||= nil # the default marker may belong to no locale row

    Plurimath.with_configuration do |configuration|
      configuration.locale = locale
      unless Plurimath.configuration.decimal == marker
        raise Error, "locale #{locale.inspect} reports decimal " \
                     "#{Plurimath.configuration.decimal.inspect}, not #{marker.inspect}"
      end

      # A FRESH parser per locale, never the memoized one. Parslet caches a
      # rule's atom on the instance the first time it is used, so a reused
      # parser would keep the marker of whichever locale reached it first --
      # which is also why the gem's own `Latex::Parser#parse` builds a new
      # `Parse` for every call.
      fresh = Plurimath::Latex::Parse.new
      own = "1#{encoded}5"
      unless leaf(rule_parse(own, :symbol_text_or_integer, on: fresh)) == ["number", own]
        raise Error, "under #{locale.inspect}, #{own.inspect} is not read as one " \
                     "number; the encoded marker and the grammar disagree"
      end

      rows.each do |other, other_encoded|
        next if other == marker

        text = "1#{other_encoded}5"
        other_tree = leaf(rule_parse(text, :symbol_text_or_integer, on: fresh))
        next unless other_tree == ["number", text]

        raise Error, "under #{locale.inspect}, #{text.inspect} is also read as one " \
                     "number, so #{other.inspect} acts as a second decimal marker"
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

  # Through `CoreDataGenerator.ts_const`, so the emitter makes the same
  # fits-or-breaks decision Biome would: a short array is printed on one line
  # and a long one expanded. Always expanding put a three-entry table over four
  # lines and `pnpm lint` rejected the generated file.
  def ts_string_list(name, value, doc)
    CoreDataGenerator.ts_const(name, "readonly string[]", value, doc: doc)
  end

  def ts_tuple_list(name, type, entries, doc)
    lines = entries.map do |key, value|
      "  [#{CoreDataGenerator.ts_string(key)}, #{CoreDataGenerator.ts_string(value)}],"
    end
    [CoreDataGenerator.ts_doc(doc), "export const #{name}: #{type} = [", *lines, "];"].join("\n")
  end

  def ts_tuple_map(name, type, entries, doc)
    lines = entries.map do |key, value|
      "  [#{CoreDataGenerator.ts_string(key)}, #{CoreDataGenerator.ts_string(value)}],"
    end
    [CoreDataGenerator.ts_doc(doc), "export const #{name}: #{type} = new Map([", *lines, "]);"]
      .join("\n")
  end

  def emit_tables_file(out_root, tables, rows, collisions, markers)
    kinds = rows.map(&:last).uniq.sort
    sections = [
      ts_header(<<~TEXT.chomp),
        The constant tables `Plurimath::Latex::Parse` builds its rules from.

        Order is behaviour throughout. `arr_to_expression` (`latex/parse.rb:196`)
        and `hash_to_expression` (`:211`) fold each table into a Parslet ordered
        choice, and Parslet's `|` has no longest-match backtracking — so these
        arrays keep the gem's own order and are never sorted here. Every entry
        was parsed back through the gem's own rule before emission.
      TEXT
      ts_string_list(
        "LATEX_NUMERIC_VALUES", tables.fetch("numericValues"),
        "`Constants::NUMERIC_VALUES` — `numeric_values` (`latex/parse.rb:38`),\n" \
        "every alternative tagged `:numeric_values`.",
      ),
      ts_string_list(
        "LATEX_UNDEROVER_CLASSES", tables.fetch("underoverClasses"),
        "`Constants::UNDEROVER_CLASSES` — `underover_classes` (`:42`), tagged\n" \
        "`:binary`. Reached only through `under_over`, which prefixes a backslash.",
      ),
      ts_string_list(
        "LATEX_MATH_OPERATORS", tables.fetch("mathOperators"),
        "`Constants::MATH_OPERATORS` — `math_operators_classes` (`:46`), tagged\n" \
        "`:unary_functions`. Written longest-first in the gem because the choice\n" \
        "is ordered: `ln` ahead of `liminf` would shadow it.",
      ),
      ts_string_list(
        "LATEX_LPAREN", tables.fetch("lparen"),
        "`Constants.parenthesis.keys` — `lparen` (`:50`), tagged `:lparen`.\n" \
        "Longest-first, from the same `reverse_sort_hash` the symbol table uses.",
      ),
      ts_string_list(
        "LATEX_RPAREN", tables.fetch("rparen"),
        "`Constants.parenthesis.values.flatten` — `rparen` (`:54`), tagged\n" \
        "`:rparen`. It repeats: several opening delimiters share one closing\n" \
        "list, and the gem flattens without deduplicating. The repeats are dead\n" \
        "alternatives in the gem too, and are carried so the two tables match.",
      ),
      ts_string_list(
        "LATEX_LEFT_RIGHT_PARENS", tables.fetch("leftRightParens"),
        "`Constants::LEFT_RIGHT_PARENTHESIS.keys` — **both** `left_parens`\n" \
        "(`:58`, tagged `:left_paren`) and `right_parens` (`:62`, tagged\n" \
        "`:right_paren`). The gem builds the closing rule from `.keys` as well,\n" \
        "which is correct rather than a slip: the hash maps delimiter token ->\n" \
        "HTML entity, so both halves of a pair are keys. Checked by parsing\n" \
        "every entry through the gem's own `right_parens`.",
      ),
      ts_string_list(
        "LATEX_ENVIRONMENTS", tables.fetch("environments"),
        "`Constants::MATRICES.keys` — `environment` (`:66`), tagged\n" \
        "`:environment`. Symbol keys in the gem; `str` calls `to_s` on them.",
      ),
      [
        CoreDataGenerator.ts_doc(
          "The nine kinds `dynamic_rules` (`latex/parse.rb:221`) branches on. Each\n" \
          "builds a *different* sub-grammar, so this is not one matcher\n" \
          "parameterised by a tag.",
        ),
        "export type LatexSymbolKind =\n  | #{kinds.map { |kind| CoreDataGenerator.ts_string(kind) }.join("\n  | ")};",
      ].join("\n"),
      [
        CoreDataGenerator.ts_doc(
          "One entry of the symbol alternation: the literal text and the kind\n" \
          "whose sub-grammar it builds.",
        ),
        "export type LatexSymbolEntry = readonly [text: string, kind: LatexSymbolKind];",
      ].join("\n"),
      ts_tuple_list(
        "LATEX_SYMBOL_CONSTANTS", "readonly LatexSymbolEntry[]", rows,
        "`Constants.symbols_constants` — the ordered choice\n" \
        "`symbol_class_commands` (`latex/parse.rb:92`) dispatches on, longest\n" \
        "text first.\n" \
        "\n" \
        "**An array, never a Map.** #{collisions.length} of these texts appear\n" \
        "TWICE, because the gem merges a Symbol-keyed table into a String-keyed\n" \
        "one and Ruby keeps both. Keying this by text would delete one entry of\n" \
        "each pair and, with it, a live grammar alternative — see\n" \
        "`LATEX_SYMBOL_CONSTANT_COLLISIONS`.",
      ),
      ts_string_list(
        "LATEX_SYMBOL_CONSTANT_COLLISIONS", collisions,
        "The texts `LATEX_SYMBOL_CONSTANTS` carries twice, sorted.\n" \
        "\n" \
        "Each appears once as `#{COLLIDING_KINDS.first}` and once as " \
        "`#{COLLIDING_KINDS.last}`,\n" \
        "in that order, and the two are different grammars: `operant` matches\n" \
        "the bare text *or* the backslashed text, `symbols` only the\n" \
        "backslashed one. Every entry was verified by parsing both spellings\n" \
        "through the gem before emission — bare reads as `{operant}` and\n" \
        "backslashed as `{symbols}`, the sole exception being `\\;`, which\n" \
        "`symbol_class_commands` claims as `:three_per_em_space` two\n" \
        "alternatives earlier.",
      ),
      ts_tuple_map(
        "LATEX_ENCODED_DECIMAL_MARKERS", "ReadonlyMap<string, string>", markers,
        "Decimal marker -> the text `decimal_marker` (`latex/parse.rb:205`)\n" \
        "actually matches.\n" \
        "\n" \
        "The gem does not match the marker: it matches\n" \
        "`Utility.string_to_html_entity(marker)`, because `Latex::Parser`\n" \
        "entity-encodes its input before Parslet sees it. `.` and `,` encode to\n" \
        "themselves; `ar`/`fa`'s U+066B encodes to seven characters. Keyed by\n" \
        "every marker `src/formatting` can resolve, each verified under its own\n" \
        "locale by a live parse and refuted under the others.",
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

        Separate from the core, formatting and corpus provenance files because a
        separate generator wrote it: the LaTeX format module owns its own parser
        tables (§3 rules 1 and 3), and each generator records its own inputs (§7).

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
        "export interface LatexParserGeneratedProvenance {",
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
        "export const LATEX_PARSER_GENERATED_PROVENANCE: LatexParserGeneratedProvenance = {",
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

    tables = literal_tables
    rows = symbol_constant_rows
    collisions = collision_texts(rows)
    markers = decimal_marker_rows
    provenance = build_provenance(gem_dir, dirty, options[:allow_dirty])

    written = [
      emit_tables_file(options[:out], tables, rows, collisions, markers),
      emit_provenance_file(options[:out], provenance),
    ]
    written.sort.each { |path| puts "  #{relative(path)}" }
    puts tables.map { |name, texts| "#{name} #{texts.length}" }.join(", ")
    puts "symbols_constants #{rows.length} entries, #{rows.map(&:last).uniq.length} kinds, " \
         "#{collisions.length} texts carried twice"
    puts "decimal markers #{markers.length}: " \
         "#{markers.map { |raw, encoded| "#{raw.inspect} -> #{encoded.inspect}" }.join(', ')}"
    puts "committable: #{provenance['committable']}"
    0
  end
end

if $PROGRAM_NAME == __FILE__
  begin
    exit LatexParserDataGenerator.run(ARGV)
  rescue LatexParserDataGenerator::Error, CoreDataGenerator::Error, CorpusGenerator::Error => e
    warn "generate-latex-parser-data: #{e.message}"
    exit 1
  end
end
