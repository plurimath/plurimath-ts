/**
 * The AsciiMath grammar, ported rule for rule from the gem's Parslet parser
 * (`lib/plurimath/asciimath/parse.rb`, plurimath 0.11.6 at `00c52783`).
 *
 * The port is deliberately structural: every `rule(:name)` in `parse.rb` is one
 * `rule(() => ...)` here, in the same source order, with the same alternatives
 * in the same order, and each carries the Ruby line it came from. Parslet's `|`
 * is an ordered choice, so alternative order is behaviour, not style; keeping
 * the shapes aligned is what makes tree parity provable and future upstream
 * changes cheap to mirror (ARCHITECTURE.md §6, TODO.plan/p1-asciimath/04).
 *
 * Rule names are Ruby's, transliterated to camelCase (`power_base` →
 * `powerBase`). Two cannot be spelled in TypeScript and are renamed, noted at
 * their definitions: `space?` → `spaceOptional`, and the `:base`/`:power`
 * *keys* stay Ruby's exactly because they are tree content, not identifiers.
 *
 * This module takes **already-preprocessed** text: the `{:` → `ℒ` rewrites live
 * in `preprocess.ts`, and the grammar sees their results (`ℒ ℛ ᑕ ᑐ`) as
 * ordinary characters. Positions in a `ParseFailed` therefore index the
 * preprocessed string, and the format's entry point maps them back through the
 * `SourceMap` before they reach a caller (ARCHITECTURE.md §5).
 *
 * Three deliberate departures from a literal transcription, each proven
 * against the gem and explained where it sits: the hoisted backslash branch in
 * `literalDispatch`, the escaped closing paren in `readText`, and `RUBY_SPACE`
 * standing in for `\s`. None changes a tree.
 *
 * No known divergence remains: every string of length 1-3 over the token
 * alphabet — 4,368 inputs — now gets the same verdict and the same tree here as
 * in the gem.
 */

import {
  DEFAULT_DECIMAL_MARKER,
  type LocaleOptions,
  resolveDecimalMarker,
} from "../../formatting/index";
import {
  ASCIIMATH_BINARY_CLASSES,
  ASCIIMATH_PARENTHESIS,
  ASCIIMATH_SUB_SUP_CLASSES,
  ASCIIMATH_TABLE_PARENTHESIS,
  ASCIIMATH_TERNARY_CLASSES,
} from "../../generated/asciimath/grammar";
import { ASCIIMATH_LITERALS, type AsciimathLiteralKind } from "../../generated/asciimath/input";
import {
  type Atom,
  alt,
  captured,
  dynamic,
  match,
  rule,
  seq,
  str,
  tokenChoice,
} from "../../pegkit";

/**
 * `Constants::PARENTHESIS`, keyed by its opening paren — the table `read_text`
 * resolves a closing paren from (`parse.rb:181`).
 */
const CLOSING_PAREN: ReadonlyMap<string, string> = new Map(ASCIIMATH_PARENTHESIS);

/**
 * What Ruby's `\s` means, spelled out — the one escape in `parse.rb` that had
 * to be rewritten for reasons other than syntax.
 *
 * `\s` is a *different character set* in the two languages, and the difference
 * is observable. Ruby matches exactly six code points; JavaScript's `\s` under
 * the `u` flag matches twenty-five, adding U+00A0, U+1680, U+2000-U+200A,
 * U+2028, U+2029, U+202F, U+205F, U+3000 and U+FEFF. Measured, not looked up:
 *
 *   ruby /\s/    -> U+0009 U+000A U+000B U+000C U+000D U+0020
 *   js   /\s/u   -> those, plus the nineteen above
 *
 * It changes trees. `"x y"` is three symbols to the gem, because the
 * no-break space fails `space` and falls through to the catch-all at
 * `parse.rb:90` — which accepts it, since Ruby's `\s` does not exclude it. A
 * verbatim `\s` here swallowed that character as whitespace instead, losing a
 * node. So both places `parse.rb` writes `\s` (the `space` rule at `:11` and
 * the negated class at `:90`) use this set literally.
 */
const RUBY_SPACE = "\\t\\n\\v\\f\\r ";

/**
 * `parse.rb:71,133,134` — the solidus that starts a fraction, as distinct from
 * the `//` the `iteration` rule claims.
 *
 * Ruby writes `/(?<!\/)\/(?!\/)/` three times, each a distinct atom; this
 * returns a fresh atom per call for the same reason (the packrat cache is keyed
 * by atom identity, so sharing one would merge three caches the gem keeps
 * apart).
 *
 * **The leading lookbehind is dropped, and that is what makes the two agree.**
 * Parslet matches through `StringScanner#match?`, whose lookbehind cannot see
 * text before the scan pointer — measured on the oracle (Ruby 4.0.1):
 *
 *   s = StringScanner.new("ab"); s.pos = 1
 *   s.match?(/(?<=a)b/)  # => nil   -- blind
 *   s.match?(/(?<!a)b/)  # => 1     -- blind
 *
 * So `(?<!\/)` is *inert* in Parslet: at the scan position there is never
 * anything behind it. A JavaScript sticky regex is not blind — it reads the
 * whole string — so transcribing the lookbehind made it fire, and `"///x"`
 * stopped parsing as a fraction where the gem parses one. Verified against
 * Parslet's own atom: `match(/(?<!\/)\/(?!\/)/)` succeeds at index 2 of
 * `"///x"`. The two forms were then compared at all 33 positions of eleven
 * solidus strings under `StringScanner`: zero disagreements.
 *
 * `\/` itself survives the `u` flag — Unicode mode restricts IdentityEscape to
 * the syntax characters *and* `/`.
 */
function solidus(): Atom {
  return match("\\/(?!\\/)");
}

/**
 * `arr_to_expression` (`parse.rb:171`): an ordered choice of literals, each
 * one named.
 *
 * Ruby's `reduce` converts only the first element, because after one iteration
 * the accumulator is an atom rather than a String or Symbol; the effect is that
 * every alternative is `str(x).as(name)`. A single-element array would return
 * the bare element instead of an atom — that is Ruby's behaviour, not a case
 * any call site reaches, and it is not reproduced here.
 */
function arrToExpression(values: readonly string[], name: string): Atom {
  return alt(...values.map((value) => str(value).as(name)));
}

/**
 * `[^x]` for one character, written as a code-point escape.
 *
 * `read_text` builds `match("[^#{rparen}]")` by interpolation, which for the
 * `[` → `]` pair yields `[^]]`. Ruby accepts that (with a warning) and reads it
 * as "not `]`"; JavaScript's `u` flag rejects it outright — `new RegExp("[^]]",
 * "yu")` throws `SyntaxError: Invalid regular expression: Lone quantifier
 * brackets`. Escaping the character is what keeps the two the same, and a
 * code-point escape sidesteps every other class metacharacter at once.
 */
function negatedCharacterClass(character: string): string {
  const code = character.codePointAt(0);
  // Unreachable by construction: `lparen` and `CLOSING_PAREN` are both built
  // from the same `ASCIIMATH_PARENTHESIS` array, and this has one call site.
  //
  // It still throws rather than returning a class, because the obvious
  // fallback is a silent disaster. Ruby's own would be `match("[^]")`, which
  // raises `RegexpError` — but `new RegExp("[^]", "yu")` is *valid* JavaScript
  // and matches **any** character, so returning it would make `read_text`
  // quietly accept everything instead of failing. An earlier comment here
  // claimed the two languages agreed on that; they do not (Copilot, PR #4).
  if (code === undefined) {
    throw new Error(
      `negatedCharacterClass: empty parenthesis character (${JSON.stringify(character)})`,
    );
  }
  return `[^\\u{${code.toString(16)}}]`;
}

/** Every rule in `parse.rb`, plus the three the `BaseNumberPrefix` mixin adds. */
export interface AsciimathRules {
  /** `parse.rb:8` */ readonly td: Atom;
  /** `parse.rb:9` */ readonly base: Atom;
  /** `parse.rb:10` */ readonly power: Atom;
  /** `parse.rb:11` */ readonly space: Atom;
  /** `parse.rb:12` */ readonly comma: Atom;
  /** `parse.rb:13` — Ruby's `space?` */ readonly spaceOptional: Atom;
  /** `parse.rb:14` */ readonly number: Atom;
  /** `base_number_prefix.rb:15` */ readonly hexNumber: Atom;
  /** `base_number_prefix.rb:19` */ readonly binaryNumber: Atom;
  /** `base_number_prefix.rb:23` */ readonly octalNumber: Atom;
  /** `parse.rb:23` */ readonly controversialSymbols: Atom;
  /** `parse.rb:24` */ readonly leftRightOpenParen: Atom;
  /** `parse.rb:25` */ readonly leftRightCloseParen: Atom;
  /** `parse.rb:26` */ readonly colorLeftParenthesis: Atom;
  /** `parse.rb:27` */ readonly colorRightParenthesis: Atom;
  /** `parse.rb:29` */ readonly ternaryClassesRules: Atom;
  /** `parse.rb:35` */ readonly ternaryClasses: Atom;
  /** `parse.rb:39` */ readonly binaryClasses: Atom;
  /** `parse.rb:43` */ readonly subSupClasses: Atom;
  /** `parse.rb:47` */ readonly openTable: Atom;
  /** `parse.rb:51` */ readonly closeTable: Atom;
  /** `parse.rb:55` */ readonly lparen: Atom;
  /** `parse.rb:62` */ readonly rparen: Atom;
  /** `parse.rb:69` */ readonly leftRight: Atom;
  /** `parse.rb:75` */ readonly quotedText: Atom;
  /** `parse.rb:81` */ readonly symbolTextOrInteger: Atom;
  /** `parse.rb:94` */ readonly powerBase: Atom;
  /** `parse.rb:102` */ readonly powerBaseRules: Atom;
  /** `parse.rb:108` */ readonly table: Atom;
  /** `parse.rb:116` */ readonly tr: Atom;
  /** `parse.rb:121` */ readonly colorValue: Atom;
  /** `parse.rb:126` */ readonly sequence: Atom;
  /** `parse.rb:132` */ readonly frac: Atom;
  /** `parse.rb:137` */ readonly mod: Atom;
  /** `parse.rb:143` */ readonly iteration: Atom;
  /** `parse.rb:157` */ readonly expression: Atom;
}

export interface AsciimathGrammar {
  /** The decimal marker every `decimal_marker` call in this grammar uses. */
  readonly decimalMarker: string;
  /** `root :expression` (`parse.rb:169`). */
  readonly root: Atom;
  readonly rules: AsciimathRules;
}

/**
 * Builds one parser for one decimal marker.
 *
 * The marker is a constructor parameter rather than a global because
 * `decimal_marker` (`parse.rb:204`) reads `Plurimath.configuration.decimal`,
 * which the locale sets — and the rule is used **twice**, by the decimal-number
 * rule (`:18`) and by the comma-separated rule (`:86`), so a comma-decimal
 * locale changes how commas parse and not only how numbers do.
 *
 * One gem quirk is **not** reproduced: `hash_to_expression` memoizes its
 * alternation in the class variable `@@expression` (`parse.rb:188`), so the
 * literal table built by the first parser instance — including the `sequence`
 * entity it closes over, and through it that instance's decimal marker — is
 * reused by every later instance whatever their configuration. Here each marker
 * gets its own self-consistent grammar.
 */
export function createAsciimathGrammar(
  decimalMarker: string = DEFAULT_DECIMAL_MARKER,
): AsciimathGrammar {
  /** `decimal_marker` (`parse.rb:204`): a fresh atom per call, as in Ruby. */
  const decimalMarkerAtom = (): Atom => str(decimalMarker);

  // --- parse.rb:8-21 -------------------------------------------------------

  const td = rule(() => expression.as("td"));
  const base = rule(() => str("__|").absent().andThen(str("_")));
  const power = rule(() => str("^"));
  // The `+` is redundant and kept deliberately. `match` consumes exactly one
  // character however many the pattern could match — pinned against parslet
  // 2.0.0 in `test/pegkit/conformance.spec.ts` — so a run of whitespace is
  // consumed by `repeat`, not by this quantifier. But `parse.rb:11` writes
  // `match(/\s+/)`, and this file transcribes the oracle's grammar rather than
  // improving on it; the redundancy is the gem's, and removing it would make
  // the two harder to diff for no behavioural gain (Copilot, PR #4).
  const space = rule(() => match(`[${RUBY_SPACE}]+`));
  const comma = rule(() => seq(str(","), spaceOptional));
  /** Ruby's `space?`; `?` is not a TypeScript identifier character. */
  const spaceOptional = rule(() => space.maybe());

  const number = rule(() =>
    alt(
      hexNumber,
      binaryNumber,
      octalNumber,
      seq(match("[0-9]").repeat(1), decimalMarkerAtom(), match("[0-9]").repeat(1)).as("number"),
      match("[0-9]").repeat(1).as("number"),
      // Ruby hardcodes `str(".")` here rather than calling `decimal_marker`, so
      // a bare `.` is a symbol under every locale. Transcribed, not corrected.
      str(".").as("symbol"),
    ),
  );

  // --- base_number_prefix.rb:15-25 (included at parse.rb:6) ----------------

  const hexNumber = rule(() =>
    seq(alt(str("0x"), str("0X")), match("[0-9a-fA-F]").repeat(1).as("hex_number")),
  );
  const binaryNumber = rule(() =>
    seq(alt(str("0b"), str("0B")), match("[01]").repeat(1).as("binary_number")),
  );
  const octalNumber = rule(() =>
    seq(alt(str("0o"), str("0O")), match("[0-7]").repeat(1).as("octal_number")),
  );

  // --- parse.rb:23-27 ------------------------------------------------------

  const controversialSymbols = rule(() => alt(powerBase, expression));
  const leftRightOpenParen = rule(() => alt(str("("), str("[")));
  const leftRightCloseParen = rule(() => alt(str(")"), str("]")));
  const colorLeftParenthesis = rule(() => alt(str("("), str("["), str("{")));
  const colorRightParenthesis = rule(() => alt(str(")"), str("]"), str("}")));

  // --- parse.rb:29-33 ------------------------------------------------------

  const ternaryClassesRules = rule(() =>
    alt(
      seq(
        str("left"),
        spaceOptional,
        leftRightOpenParen.as("left"),
        spaceOptional,
        seq(ternaryClasses, powerBase, spaceOptional, iteration.as("third_value").maybe()).as(
          "ternary",
        ),
        spaceOptional,
        str("right"),
        spaceOptional,
        leftRightCloseParen.as("right"),
      ),
      seq(ternaryClasses, powerBase, spaceOptional, iteration.as("third_value").maybe()).as(
        "ternary",
      ),
      ternaryClasses,
    ),
  );

  // --- parse.rb:35-53 ------------------------------------------------------

  const ternaryClasses = rule(() => arrToExpression(ASCIIMATH_TERNARY_CLASSES, "ternary_class"));
  const binaryClasses = rule(() => arrToExpression(ASCIIMATH_BINARY_CLASSES, "binary_class"));
  // Tagged `:binary_class` like the list above — that is the gem's naming, not
  // a transcription slip (`parse.rb:44`).
  const subSupClasses = rule(() => arrToExpression(ASCIIMATH_SUB_SUP_CLASSES, "binary_class"));
  const openTable = rule(() =>
    arrToExpression(
      ASCIIMATH_TABLE_PARENTHESIS.map(([open]) => open),
      "table_left",
    ),
  );
  const closeTable = rule(() =>
    arrToExpression(
      ASCIIMATH_TABLE_PARENTHESIS.map(([, close]) => close),
      "table_right",
    ),
  );

  // --- parse.rb:55-67 ------------------------------------------------------
  // Unlike `arr_to_expression`, these two name nothing: `table` and `sequence`
  // apply their own `.as(...)` at the use site.

  const lparen = rule(() => alt(...ASCIIMATH_PARENTHESIS.map(([open]) => str(open))));
  const rparen = rule(() => alt(...ASCIIMATH_PARENTHESIS.map(([, close]) => str(close))));

  // --- parse.rb:69-73 ------------------------------------------------------

  const leftRight = rule(() =>
    alt(
      seq(
        str("left"),
        spaceOptional,
        leftRightOpenParen.as("left"),
        spaceOptional,
        seq(iteration.maybe(), sequence.maybe()).as("left_right_value"),
        spaceOptional,
        str("right"),
        spaceOptional,
        leftRightCloseParen.as("right"),
      ),
      seq(
        seq(
          table.as("numerator"),
          spaceOptional,
          solidus(),
          spaceOptional,
          iteration.as("denominator"),
        ).as("frac"),
        expression,
      ),
      seq(table.as("table"), powerBase.maybe(), expression.maybe()),
    ),
  );

  // --- parse.rb:75-79 ------------------------------------------------------

  const quotedText = rule(() =>
    alt(
      // UnitsML is deferred (ARCHITECTURE.md §5), so the gem's first
      // alternative stays commented out rather than deleted — its shape, and
      // its position in this ordered choice, are what a later change restores:
      //
      //   seq(str('"'), str("unitsml("),
      //       seq(str(')"').absent(), any()).repeat().as("unitsml"),
      //       str(')"')),
      //
      // With it disabled, `"unitsml(kg)"` falls through to the plain
      // quoted-text alternative below and parses as `{text: "unitsml(kg)"}`.
      seq(str('"'), match('[^"]').repeat().as("text"), str('"')),
      seq(str('"'), str("").as("text")),
    ),
  );

  // --- parse.rb:81-92 ------------------------------------------------------

  const symbolTextOrInteger = rule(() =>
    alt(
      subSupClasses,
      binaryClasses,
      ternaryClasses,
      literalDispatch,
      seq(
        match("[0-9]").as("number"),
        seq(decimalMarkerAtom(), match("[0-9]")).absent(),
        str(",").as("comma"),
      )
        .repeat(1)
        .as("comma_separated"),
      quotedText,
      seq(str("d").as("d"), str("x").as("x")).as("intermediate_exp"),
      seq(seq(str("left").absent(), str("right").absent()), match("[a-zA-Z]").as("symbol")),
      // `parse.rb:90`, with one substitution. Every escape in it — `\[`, `\\`,
      // `\/`, `\]`, `\-` — is legal under the `u` flag and is transcribed as
      // written; `\-` is accepted because Unicode mode permits it inside a
      // character class (and only there). Only `\s` is replaced, by the six
      // code points Ruby's `\s` means — see `RUBY_SPACE`. Keeping `\s` here
      // would have excluded U+00A0 and eighteen other characters the gem
      // happily reads as symbols.
      match(`[^\\[{(\\\\\\/@;:.,'"|\\]})0-9a-zA-Z\\-><$%^&*_=+!\`~${RUBY_SPACE}?ℒℛᑕᑐ]`).as(
        "symbol",
      ),
      number,
    ),
  );

  // --- parse.rb:94-100 -----------------------------------------------------

  const powerBase = rule(() =>
    alt(
      seq(
        base,
        spaceOptional,
        sequence.as("base_value"),
        power,
        seq(power, power.maybe()).absent(),
        spaceOptional,
        sequence.as("power_value"),
      ),
      seq(spaceOptional, base, spaceOptional, sequence.as("base_value")).as("base"),
      seq(
        spaceOptional,
        power,
        seq(power, power.maybe()).absent(),
        spaceOptional,
        sequence.as("power_value"),
      ).as("power"),
      seq(spaceOptional, base, spaceOptional, power.as("symbol").as("base_value")).as("base"),
      seq(
        spaceOptional,
        power,
        seq(power, power.maybe()).absent(),
        spaceOptional,
        base.as("symbol").as("power_value"),
      ).as("power"),
    ),
  );

  // --- parse.rb:102-106 ----------------------------------------------------

  const powerBaseRules = rule(() =>
    alt(
      seq(subSupClasses, powerBase).as("power_base"),
      seq(
        binaryClasses,
        spaceOptional,
        sequence.as("base_value").maybe(),
        spaceOptional,
        sequence.as("power_value").maybe(),
      ).as("power_base"),
      seq(sequence.as("power_base"), powerBase).as("power_base"),
    ),
  );

  // --- parse.rb:108-114 ----------------------------------------------------

  const table = rule(() =>
    alt(
      seq(
        str("{").as("table_left"),
        spaceOptional,
        tr,
        spaceOptional,
        closeTable.as("table_right"),
      ),
      seq(
        openTable.as("table_left"),
        spaceOptional,
        tr,
        spaceOptional,
        closeTable.as("table_right"),
      ),
      seq(
        str("norm").as("norm"),
        openTable.as("table_left"),
        spaceOptional,
        tr,
        spaceOptional,
        closeTable.as("table_right"),
      ),
      seq(str("|").as("table_left"), spaceOptional, tr, spaceOptional, str("|").as("table_right")),
      seq(
        str("left"),
        spaceOptional,
        leftRightOpenParen.as("left"),
        spaceOptional,
        tr,
        spaceOptional,
        str("right"),
        spaceOptional,
        leftRightCloseParen.as("right"),
      ),
    ),
  );

  // --- parse.rb:116-119 ----------------------------------------------------

  const tr = rule(() =>
    alt(
      seq(
        seq(leftRightOpenParen.as("open_tr"), td.as("tds_list"), leftRightCloseParen).as(
          "table_row",
        ),
        spaceOptional,
        comma,
        spaceOptional,
        tr.as("expr"),
      ),
      seq(leftRightOpenParen.as("open_tr"), td.as("tds_list"), leftRightCloseParen).as("table_row"),
    ),
  );

  // --- parse.rb:121-124 ----------------------------------------------------

  const colorValue = rule(() =>
    alt(
      seq(
        colorLeftParenthesis.capture("paren").as("lparen"),
        expression.as("rgb_color"),
        colorRightParenthesis.maybe().as("rparen"),
      ).as("intermediate_exp"),
      iteration,
    ),
  );

  // --- parse.rb:126-130 ----------------------------------------------------

  const sequence = rule(() =>
    alt(
      seq(
        lparen.as("lparen"),
        spaceOptional,
        expression.maybe().as("expr"),
        spaceOptional,
        rparen.maybe().as("rparen"),
      ).as("intermediate_exp"),
      seq(str("text"), lparen.capture("paren"), readText().as("text"), rparen.maybe()).as(
        "intermediate_exp",
      ),
      symbolTextOrInteger,
    ),
  );

  // --- parse.rb:132-135 ----------------------------------------------------

  const frac = rule(() =>
    alt(
      seq(
        sequence.as("numerator"),
        spaceOptional,
        solidus(),
        spaceOptional,
        iteration.as("denominator"),
      ).as("frac"),
      seq(
        alt(powerBaseRules, powerBase).as("numerator"),
        spaceOptional,
        solidus(),
        spaceOptional,
        iteration.as("denominator"),
      ).as("frac"),
    ),
  );

  // --- parse.rb:137-141 ----------------------------------------------------

  const mod = rule(() =>
    alt(
      seq(
        sequence.as("dividend"),
        spaceOptional,
        str("mod").as("mod"),
        spaceOptional,
        iteration.as("divisor"),
      ).as("mod"),
      seq(
        seq(powerBaseRules, powerBase).as("dividend"),
        spaceOptional,
        str("mod").as("mod"),
        spaceOptional,
        iteration.as("divisor"),
      ).as("mod"),
      seq(
        powerBaseRules.as("dividend"),
        spaceOptional,
        str("mod").as("mod"),
        spaceOptional,
        iteration.as("divisor"),
      ).as("mod"),
    ),
  );

  // --- parse.rb:143-155 ----------------------------------------------------

  const iteration = rule(() =>
    alt(
      ternaryClassesRules,
      seq(table.as("table"), powerBase.maybe()),
      comma.as("comma"),
      mod,
      seq(sequence.as("sequence"), spaceOptional, str("//").as("symbol")),
      seq(str("color"), colorValue.as("color"), sequence.as("color_value")),
      frac,
      seq(powerBaseRules, powerBase),
      powerBaseRules,
      sequence.as("sequence"),
      space,
    ),
  );

  // --- parse.rb:157-167 ----------------------------------------------------
  //
  // Alternative 5 is `str("")`, which always succeeds and consumes nothing, so
  // alternatives 6-9 are reachable only through Parslet's `consume_all` retry:
  // an alternative that succeeds while leaving input behind is turned into a
  // failure inside the alternative loop, and the next alternative is tried.
  // That retry is `Atom#apply`'s, in pegkit; without it these four would be
  // dead code and an unmatched closing paren — `")"`, `"x)"`, `"2)"`, `"]"`,
  // `"}"`, `")x"` — would not parse, though it does in the gem.

  const expression = rule(() =>
    alt(
      leftRight.as("left_right"),
      seq(iteration, spaceOptional, expression).as("expr"),
      seq(base.as("symbol"), expression.maybe()).as("expr"),
      seq(power.as("symbol"), expression.maybe()).as("expr"),
      str(""),
      seq(
        rparen.as("rparen"),
        spaceOptional,
        controversialSymbols,
        comma.as("comma").maybe(),
        expression,
      )
        .repeat(1)
        .as("expr"),
      seq(power.as("symbol"), spaceOptional, expression).as("expr"),
      seq(
        table.as("table"),
        spaceOptional,
        rparen.as("rparen"),
        spaceOptional,
        expression.as("expr").maybe(),
      ),
      comma.as("comma").maybe(),
    ),
  );

  // --- helpers (parse.rb:171-216) ------------------------------------------

  /**
   * `read_text` (`parse.rb:179`): read everything up to the closing paren that
   * matches the one `sequence` captured.
   */
  function readText(): Atom {
    return dynamic((context) => {
      const open = captured(context, "paren") ?? "";
      return match(negatedCharacterClass(CLOSING_PAREN.get(open) ?? "")).repeat();
    });
  }

  /**
   * `unary_functions` (`parse.rb:208`).
   *
   * The gem selects the underbrace branch by comparing `first_value.to_s` to
   * `"'underbrace'"` / `"'ubrace'"` — quotes included, because that is how
   * `Parslet::Atoms::Str#to_s_inner` renders itself. The comparison is on the
   * literal, which is what this checks directly.
   *
   * `firstValue` is built once and shared by both alternatives, as in Ruby: the
   * packrat cache is keyed by atom identity, so one atom means one cache entry
   * for the two attempts.
   */
  function unaryFunctions(literal: string): Atom {
    const firstValue = str(literal);
    if (literal === "underbrace" || literal === "ubrace") {
      return alt(
        seq(firstValue.as("unary_class"), spaceOptional, str("_").as("symbol")).as("unary"),
        seq(firstValue.as("unary_class"), spaceOptional, sequence.maybe()).as("unary"),
      );
    }
    return alt(
      seq(firstValue.as("unary_class").as("power_base"), spaceOptional, powerBase).as("unary"),
      seq(firstValue.as("unary_class"), spaceOptional, sequence.maybe()).as("unary"),
    );
  }

  /**
   * `dynamic_parser_rules` (`parse.rb:194`) minus its `:symbol` prefix, which
   * `literalDispatch` hoists.
   *
   * Each of the four kinds builds a *different* atom — this is not one literal
   * matcher parameterised by a name.
   */
  function dynamicParserRules(literal: string, kind: AsciimathLiteralKind): Atom {
    switch (kind) {
      case "symbol":
        return str(literal).as("symbol");
      case "unary_class":
        return unaryFunctions(literal);
      case "fonts":
        return seq(str(literal).as("fonts_class"), spaceOptional, sequence.as("fonts_value"));
      case "special_fonts":
        return str(literal).as("bold_fonts");
    }
  }

  /**
   * `hash_to_expression(Constants.precompile_constants)` (`parse.rb:85`): the
   * ordered choice over all 3,330 literals, longest first.
   *
   * Two things make this more than `tokenChoice(literal => str(literal))`:
   *
   * 1. **Each kind builds a different atom** — see `dynamicParserRules`.
   * 2. **The `:symbol` kind carries a prefix alternative**, tried *before* the
   *    literal: `(str("\\").as(:slash) >> match("\s").repeat >> str("\n"))`.
   *    Note `"\s"` is a Ruby double-quoted string, so it is the space character
   *    U+0020, not the `\s` character class — this matches a backslash, then
   *    spaces, then a newline.
   *
   * That prefix is rebuilt for every one of the 3,267 `:symbol` literals, and
   * Parslet's `Alternative#|` flattens the reduction into one list whose first
   * two entries are the first literal's prefix and the first literal itself.
   * So the effective order is `prefix, literal₁, prefix, literal₂, …`, and
   * every prefix after the first is a repeat of an attempt that already failed
   * at this position. Hoisting one copy to the front and dropping the rest is
   * therefore exactly equivalent — and it is what lets the remaining
   * alternatives go through `tokenChoice`, since each then starts with its own
   * literal and bucketing by first character cannot reorder an ordered choice.
   *
   * The hoist is not merely an optimisation: two literals (`"\\"` and `"\\ "`)
   * do start with a backslash, so leaving the prefix inside the buckets would
   * have put it behind them.
   */
  function buildLiteralDispatch(): Atom {
    const backslash = seq(str("\\").as("slash"), match(" ").repeat(), str("\n"));
    const entries: Array<readonly [string, Atom]> = [];
    for (const [literal, kind] of ASCIIMATH_LITERALS) {
      entries.push([literal, dynamicParserRules(literal, kind)]);
    }
    return alt(backslash, tokenChoice(entries));
  }

  const literalDispatch = rule(buildLiteralDispatch);

  const rules: AsciimathRules = {
    td,
    base,
    power,
    space,
    comma,
    spaceOptional,
    number,
    hexNumber,
    binaryNumber,
    octalNumber,
    controversialSymbols,
    leftRightOpenParen,
    leftRightCloseParen,
    colorLeftParenthesis,
    colorRightParenthesis,
    ternaryClassesRules,
    ternaryClasses,
    binaryClasses,
    subSupClasses,
    openTable,
    closeTable,
    lparen,
    rparen,
    leftRight,
    quotedText,
    symbolTextOrInteger,
    powerBase,
    powerBaseRules,
    table,
    tr,
    colorValue,
    sequence,
    frac,
    mod,
    iteration,
    expression,
  };

  return { decimalMarker, root: expression, rules };
}

/**
 * One grammar per decimal marker, built on first use.
 *
 * Building it is not cheap — the literal table alone is 3,330 atoms — and it is
 * immutable once built, so the parse-time state that would make sharing unsafe
 * (the packrat cache, the capture stack) lives in the per-parse context rather
 * than on the atoms. The cache is keyed by marker, never by locale: two locales
 * that share a marker share a grammar.
 */
const grammarCache = new Map<string, AsciimathGrammar>();

/** The grammar for a caller's locale, resolved through `formatting`. */
export function asciimathGrammar(options?: LocaleOptions | null): AsciimathGrammar {
  const marker = resolveDecimalMarker(options);
  let grammar = grammarCache.get(marker);
  if (grammar === undefined) {
    grammar = createAsciimathGrammar(marker);
    grammarCache.set(marker, grammar);
  }
  return grammar;
}

/**
 * Parses **preprocessed** AsciiMath into a Parslet-shaped tree.
 *
 * Throws `ParseFailed`, whose `index` is a UTF-16 offset into the *supplied*
 * (preprocessed) string. Translating that back to the caller's input, and
 * turning it into a `ParseError`, is the format entry point's job — it owns the
 * `SourceMap` that `preprocess` returns (ARCHITECTURE.md §5).
 */
export function parseAsciimathPreprocessed(preprocessed: string, options?: LocaleOptions | null) {
  return asciimathGrammar(options).root.parse(preprocessed);
}
