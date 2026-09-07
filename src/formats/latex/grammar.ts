/**
 * The LaTeX grammar, ported rule for rule from the gem's Parslet parser
 * (`lib/plurimath/latex/parse.rb`, plurimath 0.11.6 at `00c52783`).
 *
 * The port is deliberately structural, exactly as `asciimath/grammar.ts` is:
 * every `rule(:name)` in `latex/parse.rb` is one `rule(() => ...)` here, in the
 * same source order, with the same alternatives in the same order, and each
 * carries the Ruby line it came from. Parslet's `|` is an ordered choice, so
 * alternative order is behaviour, not style.
 *
 * Rule names are Ruby's, transliterated to camelCase (`power_base` →
 * `powerBase`). Tree *keys* stay Ruby's exactly — they are data, not
 * identifiers — including the one String key `"\\\\"` at `latex/parse.rb:111`,
 * which is a String in Ruby too and is the only non-Symbol among the 46.
 *
 * This module takes **already-preprocessed** text. `Latex::Parser#initialize`
 * (`latex/parser.rb:12`) entity-encodes its input, strips unescaped spaces and
 * reverses five specific encodings before Parslet ever runs; that pass is a
 * separate slice, and until it lands a caller supplies the preprocessed string
 * itself. It is why `decimal_marker` matches an *encoded* marker — see
 * `decimalMarkerAtom` below.
 *
 * There is no transform yet: this produces the Parslet-shaped tree and stops.
 * `latex/transform.rb` and a `parseLatex` entry point are the next slice, which
 * is why `index.ts` still publishes output only.
 *
 * Three deliberate departures from a literal transcription, each argued where
 * it sits and each covered by the oracle fixtures in
 * `test/formats/latex/grammar.spec.ts`: `RUBY_SPACE` standing in for `\s`, the
 * hoisted backslash in `symbolAlternation`, and the bucketed dispatch that
 * hoisting enables. None changes a tree.
 */

import {
  DEFAULT_DECIMAL_MARKER,
  type LocaleOptions,
  resolveDecimalMarker,
} from "../../formatting/index";
import { type Atom, alt, any, match, rule, seq, str, tokenChoice } from "../../pegkit";
import {
  LATEX_ENCODED_DECIMAL_MARKERS,
  LATEX_ENVIRONMENTS,
  LATEX_LEFT_RIGHT_PARENS,
  LATEX_LPAREN,
  LATEX_MATH_OPERATORS,
  LATEX_NUMERIC_VALUES,
  LATEX_RPAREN,
  LATEX_SYMBOL_CONSTANTS,
  LATEX_UNDEROVER_CLASSES,
  type LatexSymbolKind,
} from "./generated/parser-tables";

/**
 * What Ruby's `\s` means, spelled out — the same substitution
 * `asciimath/grammar.ts` makes, for the same measured reason. Ruby's `\s` is
 * six code points; JavaScript's under the `u` flag is twenty-five, adding
 * U+00A0 and eighteen others. `latex/parse.rb:111` writes `match(/\s/)` and a
 * verbatim transcription would swallow characters the gem leaves for the next
 * rule.
 */
const RUBY_SPACE = "\\t\\n\\v\\f\\r ";

/**
 * Ruby's `"\s"` — a double-quoted **String**, not a regexp class, so it is the
 * single character U+0020. `latex/parse.rb:117` writes `match("\s")` where
 * `:111` writes `match(/\s/)`, and the two are different sets: measured on the
 * oracle, `"\s".bytes` is `[32]`. Rendering both as `\s` would widen the
 * unclosed-group terminator from "a space" to "any whitespace".
 */
const RUBY_STRING_SPACE = " ";

/**
 * `arr_to_expression` (`latex/parse.rb:196`): an ordered choice of literals,
 * each one named.
 *
 * Ruby's `reduce` converts only the first element, because after one iteration
 * the accumulator is an atom rather than a String or Symbol; the effect is that
 * every alternative is `str(x).as(name)`. A single-element array would return
 * the bare element instead of an atom — that is Ruby's behaviour and no call
 * site reaches it (the smallest table here has three entries), and it is not
 * reproduced.
 *
 * The gem memoizes each result in the class variable `@@new_hash`, keyed by the
 * tag rather than by the array, so every `Parse` instance in the process shares
 * one alternation. Here each grammar builds its own; the tables are constants,
 * so the only difference is which object is shared with whom.
 */
function arrToExpression(values: readonly string[], name: string): Atom {
  return alt(...values.map((value) => str(value).as(name)));
}

/** Every rule in `latex/parse.rb`, plus the three the `BaseNumberPrefix` mixin adds. */
export interface LatexRules {
  /** `latex/parse.rb:8` */ readonly base: Atom;
  /** `latex/parse.rb:9` */ readonly power: Atom;
  /** `latex/parse.rb:10` */ readonly slash: Atom;
  /** `latex/parse.rb:11` */ readonly underOver: Atom;
  /** `latex/parse.rb:12` */ readonly arrayArgs: Atom;
  /** `latex/parse.rb:13` */ readonly arrayBegin: Atom;
  /** `latex/parse.rb:16`, redefined identically at `:25` */ readonly optionalArgs: Atom;
  /** `latex/parse.rb:20` */ readonly color: Atom;
  /** `latex/parse.rb:29` — Ruby's spelling of "beginning" */ readonly begining: Atom;
  /** `latex/parse.rb:34` */ readonly ending: Atom;
  /** `latex/parse.rb:38` */ readonly numericValues: Atom;
  /** `latex/parse.rb:42` */ readonly underoverClasses: Atom;
  /** `latex/parse.rb:46` */ readonly mathOperatorsClasses: Atom;
  /** `latex/parse.rb:50` */ readonly lparen: Atom;
  /** `latex/parse.rb:54` */ readonly rparen: Atom;
  /** `latex/parse.rb:58` */ readonly leftParens: Atom;
  /** `latex/parse.rb:62` */ readonly rightParens: Atom;
  /** `latex/parse.rb:66` */ readonly environment: Atom;
  /** `latex/parse.rb:70` */ readonly subscript: Atom;
  /** `latex/parse.rb:74` */ readonly supscript: Atom;
  /** `latex/parse.rb:78` */ readonly mathOperators: Atom;
  /** `latex/parse.rb:82` */ readonly sqrtArg: Atom;
  /** `latex/parse.rb:87` */ readonly limits: Atom;
  /** `latex/parse.rb:92` */ readonly symbolClassCommands: Atom;
  /** `latex/parse.rb:101` */ readonly symbolTextOrInteger: Atom;
  /** `latex/parse.rb:116` */ readonly intermediateExp: Atom;
  /** `latex/parse.rb:122` */ readonly parsingTextValues: Atom;
  /** `latex/parse.rb:129` */ readonly powerBase: Atom;
  /** `latex/parse.rb:136` */ readonly binaryFunctions: Atom;
  /** `latex/parse.rb:143` */ readonly sequence: Atom;
  /** `latex/parse.rb:164` */ readonly leftRight: Atom;
  /** `latex/parse.rb:175` */ readonly overClass: Atom;
  /** `latex/parse.rb:183` */ readonly iteration: Atom;
  /** `latex/parse.rb:188` */ readonly expression: Atom;
  /** `base_number_prefix.rb:15` */ readonly hexNumber: Atom;
  /** `base_number_prefix.rb:19` */ readonly binaryNumber: Atom;
  /** `base_number_prefix.rb:23` */ readonly octalNumber: Atom;
}

export interface LatexGrammar {
  /** The caller's decimal marker, before encoding. */
  readonly decimalMarker: string;
  /** What `decimal_marker` (`latex/parse.rb:205`) actually matches. */
  readonly encodedDecimalMarker: string;
  /** `root :expression` (`latex/parse.rb:194`). */
  readonly root: Atom;
  readonly rules: LatexRules;
}

/**
 * Builds one parser for one decimal marker.
 *
 * The marker is a constructor parameter rather than a global because
 * `decimal_marker` (`latex/parse.rb:205`) reads
 * `Plurimath.configuration.decimal`, and the gem builds a fresh `Parse` for
 * every call (`latex/parser.rb:16`), so the marker is effectively a per-parse
 * input. Unlike `arr_to_expression` and `hash_to_expression`, `decimal_marker`
 * is deliberately **not** memoized in the gem — caching all three uniformly
 * would break locale switching.
 */
export function createLatexGrammar(decimalMarker: string = DEFAULT_DECIMAL_MARKER): LatexGrammar {
  /**
   * `decimal_marker` (`latex/parse.rb:205`), which does not match the marker:
   * it matches `Utility.string_to_html_entity(marker)`, because
   * `Latex::Parser#pre_processing` entity-encodes the input before Parslet sees
   * it. `.` and `,` encode to themselves; `ar`/`fa`'s U+066B encodes to the
   * seven characters `&#x66b;`, and a grammar matching the raw code point would
   * never fire. The table is generated and every entry verified by a live parse
   * under its own locale (`scripts/generate-latex-parser-data.rb`).
   *
   * A fresh atom per call, as in Ruby — the packrat cache is keyed by atom
   * identity, so sharing one would merge caches the gem keeps apart. There is
   * one call site (`:109`), so this is shape rather than consequence.
   */
  const encodedDecimalMarker = LATEX_ENCODED_DECIMAL_MARKERS.get(decimalMarker);
  if (encodedDecimalMarker === undefined) {
    // Unreachable through `resolveDecimalMarker`, whose result is always one of
    // the generated table's keys — asserted in
    // `test/formats/latex/parser-tables.spec.ts`. It throws rather than falling
    // back to the raw marker because that fallback is the silent-disaster
    // branch: under `ar` it would build a grammar matching a character the
    // preprocessed input can never contain, and every decimal would quietly
    // split into three nodes.
    throw new Error(
      `createLatexGrammar: no encoded form for decimal marker ${JSON.stringify(decimalMarker)}`,
    );
  }
  const decimalMarkerAtom = (): Atom => str(encodedDecimalMarker);

  // --- latex/parse.rb:8-27 -------------------------------------------------

  const base = rule(() => str("_"));
  const power = rule(() => str("^"));
  const slash = rule(() => str("\\"));
  const underOver = rule(() => seq(slash, underoverClasses));
  const arrayArgs = rule(() => seq(str("{"), expression.as("args"), str("}")));
  const arrayBegin = rule(() => seq(str("\\begin{"), str("array").as("environment"), str("}")));

  /**
   * `latex/parse.rb:16` — and again, byte for byte, at `:25`.
   *
   * Parslet's `rule` defines a method, so the second definition replaces the
   * first and only one survives into the gem's own grammar. The two bodies are
   * identical in the oracle's source, so which one wins is unobservable; the
   * port carries one, and the duplicate is recorded here rather than silently
   * dropped.
   */
  const optionalArgs = rule(() =>
    seq(str("["), intermediateExp.maybe().as("options"), str("]")).maybe(),
  );

  /**
   * `latex/parse.rb:20`. The only rule in the file that uses `any`, and one of
   * the two that use `absent?`.
   *
   * The second alternative takes **one character, whatever it is**, as the
   * colour: `\color` followed by anything at all consumes a colour. There is no
   * validation of colour names anywhere in the gem's LaTeX path.
   */
  const color = rule(() =>
    alt(
      seq(str("{"), seq(str("}").absent(), any()).repeat().as("symbol"), str("}")),
      any().as("symbol"),
    ),
  );

  // --- latex/parse.rb:29-36 ------------------------------------------------

  /** Ruby spells it `begining`; the name is kept so the two files diff. */
  const begining = rule(() =>
    alt(
      seq(
        slash,
        str("begin"),
        seq(str("{"), symbolTextOrInteger, str("*").as("asterisk"), str("}")),
        optionalArgs.maybe(),
      ),
      seq(slash, str("begin"), seq(str("{"), symbolTextOrInteger, str("}"))),
    ),
  );

  const ending = rule(() =>
    seq(slash, str("end"), seq(str("{"), symbolTextOrInteger, str("*").maybe(), str("}"))).as(
      "ending",
    ),
  );

  // --- latex/parse.rb:38-68 ------------------------------------------------
  // Seven table-driven rules, each an ordered choice of literals under one tag.

  const numericValues = rule(() => arrToExpression(LATEX_NUMERIC_VALUES, "numeric_values"));
  const underoverClasses = rule(() => arrToExpression(LATEX_UNDEROVER_CLASSES, "binary"));
  const mathOperatorsClasses = rule(() => arrToExpression(LATEX_MATH_OPERATORS, "unary_functions"));
  const lparen = rule(() => arrToExpression(LATEX_LPAREN, "lparen"));
  const rparen = rule(() => arrToExpression(LATEX_RPAREN, "rparen"));
  const leftParens = rule(() => arrToExpression(LATEX_LEFT_RIGHT_PARENS, "left_paren"));
  /**
   * `latex/parse.rb:62` builds this from `LEFT_RIGHT_PARENTHESIS.keys` — the
   * same array `left_parens` uses, not `.values`. That reads like a
   * copy-paste slip and is not one: the hash maps delimiter token -> HTML
   * entity, so `\lfloor` and `\rfloor` are both keys and the entities are not
   * what `\right` is followed by. The generator proves it by parsing every
   * entry through the gem's own `right_parens`.
   */
  const rightParens = rule(() => arrToExpression(LATEX_LEFT_RIGHT_PARENS, "right_paren"));
  const environment = rule(() => arrToExpression(LATEX_ENVIRONMENTS, "environment"));

  // --- latex/parse.rb:70-90 ------------------------------------------------

  const subscript = rule(() => seq(intermediateExp, base, intermediateExp.as("subscript")));
  const supscript = rule(() => seq(intermediateExp, power, intermediateExp.as("supscript")));
  const mathOperators = rule(() => seq(symbolTextOrInteger.as("first_value"), str("\\limits")));

  const sqrtArg = rule(() =>
    alt(
      seq(str("[").as("lparen"), intermediateExp.repeat(1).as("expression"), str("]").as("rparen")),
      seq(str("[").as("lparen"), str("]").as("rparen")),
    ),
  );

  /**
   * `latex/parse.rb:87`. Tags with `:base`/`:power`, not
   * `:subscript`/`:supscript` — `transform.rb:672` keys on
   * `first_value/base/power` to build `Math::Function::Limits`, so the naming
   * is load-bearing rather than incidental.
   */
  const limits = rule(() =>
    alt(
      seq(mathOperators, base, intermediateExp.as("base"), power, intermediateExp.as("power")),
      seq(mathOperators, power, intermediateExp.as("power"), base, intermediateExp.as("base")),
    ),
  );

  // --- latex/parse.rb:92-99 ------------------------------------------------

  /**
   * `symbol_class_commands`. The entity branch's `repeat` has **min 0**, so
   * `&#x;` is a legal match producing an empty hex body — measured on the
   * oracle, where it yields one symbol node carrying the literal text `&#x;`.
   * Nothing here validates an entity, and nothing downstream does either.
   */
  const symbolClassCommands = rule(() =>
    alt(
      seq(str("&#x"), match("[0-9a-fA-F]").repeat(), str(";")).as("unicode_symbols"),
      str("\\;").as("three_per_em_space"),
      symbolAlternation,
      underOver,
      environment,
      numericValues,
    ),
  );

  // --- latex/parse.rb:101-114 ----------------------------------------------

  const symbolTextOrInteger = rule(() =>
    alt(
      str('"').as("symbol"),
      // `rparen.absent?` is the second and last negative lookahead in the file.
      // It stops a closing delimiter being swallowed as a symbol.
      seq(rparen.absent(), symbolClassCommands),
      seq(slash, mathOperatorsClasses),
      match("[a-zA-Z]").as("symbols"),
      hexNumber,
      binaryNumber,
      octalNumber,
      // `digits* marker? digits+`, so this also accepts a bare integer — which
      // makes the next alternative unreachable for anything this one accepts.
      // Transcribed anyway: it is the gem's shape, and removing it would be a
      // judgement about a branch the oracle still carries.
      seq(match("[0-9]").repeat(0), decimalMarkerAtom().maybe(), match("[0-9]").repeat(1)).as(
        "number",
      ),
      match("[0-9]").repeat(1).as("number"),
      // The one String tree key in the grammar (`transform.rb:27` matches it
      // with `rule("\\\\" => simple(:slash))`). In Ruby `{"\\\\" => x}` and
      // `{:"\\\\" => x}` are different keys; here there is one string type, and
      // no Symbol key collides with it.
      seq(str("\\\\").as("\\\\"), match(`[${RUBY_SPACE}]`).repeat()),
      str("\\ ").as("space"),
      seq(str("\\operatorname{"), match("[^}]").repeat().as("symbols"), str("}")),
    ),
  );

  // --- latex/parse.rb:116-127 ----------------------------------------------

  /**
   * `intermediate_exp`. Note the closing-delimiter fallback in the first
   * alternative: an unclosed group can be terminated by `\.` (with an optional
   * *space*, `RUBY_STRING_SPACE`, not any whitespace), or by nothing at all —
   * the whole right-paren clause is `.maybe`.
   */
  const intermediateExp = rule(() =>
    alt(
      seq(
        lparen.as("left_paren"),
        expression.maybe().as("expression"),
        alt(
          rparen,
          seq(slash, seq(match(RUBY_STRING_SPACE).maybe(), str(".")).maybe()).as("rparen"),
        )
          .maybe()
          .as("right_paren"),
      ).as("intermediate_exp"),
      seq(str("{"), expression.maybe().as("expression"), str("}")),
      symbolTextOrInteger,
    ),
  );

  /**
   * `parsing_text_values`, the brace-balanced body of `\text{...}`.
   *
   * It recurses on itself in three of its four alternatives, but never at the
   * left edge: alternatives 1 and 2 consume `{` first and alternative 3
   * consumes one non-`}` character first, so a PEG engine terminates. The
   * fourth is a min-0 repeat and always succeeds.
   */
  const parsingTextValues = rule(() =>
    alt(
      seq(seq(str("{"), parsingTextValues, str("}")), parsingTextValues),
      seq(str("{"), parsingTextValues, str("}")),
      seq(match("[^}]"), parsingTextValues),
      match("[^}]").repeat(),
    ),
  );

  // --- latex/parse.rb:129-141 ----------------------------------------------

  const powerBase = rule(() =>
    alt(
      seq(subscript, power, intermediateExp.as("supscript")).as("power_base"),
      seq(supscript, base, intermediateExp.as("subscript")).as("power_base"),
      supscript.as("power"),
      subscript.as("base"),
    ),
  );

  const binaryFunctions = rule(() =>
    alt(
      seq(intermediateExp.as("first_value"), underOver, intermediateExp.as("second_value")).as(
        "under_over",
      ),
      seq(
        slash,
        str("sqrt").as("root"),
        sqrtArg.as("first_value"),
        intermediateExp.as("second_value"),
      ).as("binary"),
      seq(slash, str("sqrt").as("sqrt"), intermediateExp.as("intermediate_exp")).as("binary"),
      colorRules(),
    ),
  );

  // --- latex/parse.rb:143-162 ----------------------------------------------

  /**
   * `sequence`, the eighteen-branch top-level alternation. Branch order is
   * semantics; this is the rule to read against the oracle first.
   *
   * The last branch is unreachable: the bare `intermediateExp` immediately
   * before it succeeds on anything this one would start with. Read from the
   * source, not demonstrated by an input — and transcribed rather than dropped,
   * because "unreachable" is a claim about the whole grammar and the oracle
   * still carries the branch.
   */
  const sequence = rule(() =>
    alt(
      limits.as("limits"),
      seq(binaryFunctions.as("binary_functions"), power, sequence.as("supscript")).as("power"),
      seq(binaryFunctions.as("binary_functions"), base, sequence.as("subscript")).as("base"),
      binaryFunctions,
      seq(
        slash,
        str("rule").as("rule"),
        sqrtArg.maybe().as("first_value"),
        intermediateExp.maybe().as("second_value"),
        intermediateExp.maybe().as("third_value"),
      ).as("binary"),
      seq(overClass, power, intermediateExp.as("supscript")),
      seq(overClass, base, intermediateExp.as("subscript")),
      overClass,
      seq(leftRight.as("left_right"), power, intermediateExp.as("supscript")),
      seq(leftRight.as("left_right"), base, intermediateExp.as("subscript")),
      leftRight.as("left_right"),
      seq(slash, str("substack").as("substack"), intermediateExp),
      seq(arrayBegin, arrayArgs, expression.as("table_data"), ending).as("environment"),
      seq(begining, expression.as("table_data"), ending).as("environment"),
      seq(slash, environment, intermediateExp).as("table_data"),
      powerBase,
      intermediateExp,
      seq(intermediateExp.as("intermediate_exp"), rparen.as("symbol")),
    ),
  );

  // --- latex/parse.rb:164-181 ----------------------------------------------

  const leftRight = rule(() =>
    seq(
      str("\\left").as("left"),
      alt(leftParens, str(".").maybe()),
      alt(
        seq(expression.repeat().as("dividend"), str("\\over"), expression.repeat().as("divisor")),
        expression.as("expression").maybe(),
      ),
      seq(str("\\right").as("right").maybe(), alt(rightParens, str(".").maybe())),
    ),
  );

  const overClass = rule(() =>
    alt(
      seq(
        str("{"),
        expression.repeat().as("dividend"),
        str("\\over"),
        expression.repeat().as("divisor"),
        str("}"),
      ),
      seq(leftRight.as("left_right").as("power"), power, intermediateExp),
      seq(leftRight.as("left_right").as("base"), base, intermediateExp),
    ).as("over"),
  );

  // --- latex/parse.rb:183-192 ----------------------------------------------

  const iteration = rule(() =>
    alt(
      seq(sequence.as("sequence"), iteration.as("expression")),
      seq(sequence, expression.maybe()),
    ),
  );

  const expression = rule(() =>
    alt(
      seq(iteration, expression),
      iteration,
      seq(
        seq(iteration.as("dividend"), str("\\over"), iteration.as("divisor")),
        expression.maybe(),
      ),
    ),
  );

  // --- base_number_prefix.rb:15-25 (included at latex/parse.rb:6) ----------

  const hexNumber = rule(() =>
    seq(alt(str("0x"), str("0X")), match("[0-9a-fA-F]").repeat(1).as("hex_number")),
  );
  const binaryNumber = rule(() =>
    seq(alt(str("0b"), str("0B")), match("[01]").repeat(1).as("binary_number")),
  );
  const octalNumber = rule(() =>
    seq(alt(str("0o"), str("0O")), match("[0-7]").repeat(1).as("octal_number")),
  );

  // --- helpers (latex/parse.rb:196-278) ------------------------------------

  /** `slashed_value` (`latex/parse.rb:255`), minus the leading `slash`. */
  function named(firstValue: Atom, name: string): Atom {
    return firstValue.as(name);
  }

  /**
   * `dynamic_power_base` (`latex/parse.rb:268`): the canonical sub/sup
   * ordering. Both `_x^y` and `^y_x` are accepted and normalised to the same
   * `{subscript, supscript}` shape.
   *
   * A function, not a constant, because Ruby's is a method: every call site
   * gets a distinct atom, and the packrat cache is keyed by atom identity.
   */
  function dynamicPowerBase(): Atom {
    return alt(
      seq(base, intermediateExp.as("subscript"), power, intermediateExp.as("supscript")),
      seq(power, intermediateExp.as("supscript"), base, intermediateExp.as("subscript")),
      seq(power, intermediateExp.as("supscript")),
      seq(base, intermediateExp.as("subscript")),
    );
  }

  /** `unary_rules` (`latex/parse.rb:259`), minus each alternative's leading `slash`. */
  function unaryRules(firstValue: Atom): Atom {
    return alt(
      seq(named(firstValue, "unary_functions"), dynamicPowerBase()),
      seq(named(firstValue, "unary"), leftRight.as("first_value")).as("unary_functions"),
      seq(named(firstValue, "unary"), intermediateExp.as("first_value")).as("unary_functions"),
      named(firstValue, "unary"),
    );
  }

  /** `color_rules` (`latex/parse.rb:275`). */
  function colorRules(): Atom {
    return alt(
      seq(
        str("{"),
        slash,
        str("color").as("binary"),
        color.as("first_value"),
        seq(sequence, iteration.maybe()).as("second_value").maybe(),
        str("}"),
      ),
      seq(
        slash,
        str("color").as("binary"),
        color.as("first_value"),
        expression.as("second_value").maybe(),
      ),
    );
  }

  /**
   * `dynamic_rules` (`latex/parse.rb:221`) split into its two halves: what the
   * entry matches with a leading backslash, and — for `:operant` alone — what
   * it matches without one.
   *
   * Each of the nine kinds builds a *different* sub-grammar; this is not one
   * literal matcher parameterised by a tag. `firstValue` is built once and
   * shared by every alternative of an entry, as in Ruby, so the atom-keyed
   * packrat cache holds one entry for the whole group.
   *
   * **The leading `slash` is hoisted out.** In the gem every alternative of
   * every kind except `:operant`'s first begins with `slash >> ...`, so
   * `alt(seq(slash, A), seq(slash, B))` is factored to `seq(slash, alt(A, B))`.
   * `slash` is `str("\\")`: it consumes exactly one character and either
   * matches or does not, so factoring a common deterministic prefix out of an
   * ordered choice changes neither which alternative wins nor where it starts.
   * Nor does it change a tree: Parslet discards an unnamed slice from a
   * sequence that has named parts, so the backslash contributes nothing
   * whichever side of the `.as(...)` it sits on.
   */
  function dynamicRules(
    text: string,
    kind: LatexSymbolKind,
  ): { readonly bare: Atom | null; readonly slashed: Atom } {
    const firstValue = str(text);
    switch (kind) {
      case "operant":
        return { bare: named(firstValue, "operant"), slashed: named(firstValue, "symbols") };
      case "symbols":
        return { bare: null, slashed: named(firstValue, "symbols") };
      case "unary":
        return { bare: null, slashed: unaryRules(firstValue) };
      case "fonts":
        return {
          bare: null,
          slashed: seq(
            named(firstValue, "fonts"),
            alt(binaryFunctions, intermediateExp).as("intermediate_exp"),
          ),
        };
      case "power_base":
        return {
          bare: null,
          slashed: alt(
            seq(named(firstValue, "binary"), dynamicPowerBase()).as("power_base"),
            named(firstValue, "binary"),
          ),
        };
      case "underover":
        return {
          bare: null,
          slashed: alt(
            seq(named(firstValue, "underover"), dynamicPowerBase()),
            seq(
              named(firstValue, "underover"),
              intermediateExp.maybe().as("first_value"),
              dynamicPowerBase(),
            ),
            named(firstValue, "underover"),
          ),
        };
      case "binary":
        return {
          bare: null,
          slashed: seq(
            named(firstValue, "binary"),
            intermediateExp.as("first_value"),
            intermediateExp.as("second_value"),
          ).as("binary"),
        };
      case "text":
        return {
          bare: null,
          slashed: seq(
            named(firstValue, "text"),
            seq(str("{"), parsingTextValues.as("first_value"), str("}")),
          ),
        };
      case "ternary":
        return {
          bare: null,
          slashed: alt(
            seq(
              named(firstValue, "ternary_functions"),
              dynamicPowerBase(),
              sequence.as("third_value").maybe(),
            ).as("ternary_class"),
            named(firstValue, "ternary"),
          ),
        };
    }
  }

  /**
   * `hash_to_expression(Constants.symbols_constants)` (`latex/parse.rb:95`):
   * the ordered choice over all 3,327 entries, longest text first.
   *
   * Two departures from `alt(...)` over 3,327 atoms, and they rest on the same
   * fact. **No `:operant` text starts with a backslash** — asserted below, over
   * the generated table, because the whole construction depends on it. So at
   * any one position either the input is at a `\` and only backslashed
   * alternatives can match, or it is not and only bare ones can:
   *
   * 1. The two groups are emitted as two branches rather than interleaved in
   *    table order. Since no position can reach both, their relative order is
   *    inert; within each group the gem's order is preserved exactly.
   * 2. Each group goes through `tokenChoice`, which buckets by an
   *    alternative's first character and so skips thousands of candidates that
   *    cannot match — the same device `asciimath/grammar.ts` uses, and sound
   *    for the same reason: two entries in different buckets can never both
   *    match at one position, so bucketing cannot reorder an ordered choice.
   *    Hoisting the backslash out (see `dynamicRules`) is what makes the
   *    backslashed group bucketable at all; left inside, every one of its
   *    3,327 entries would start with `\` and share a single bucket.
   *
   * The gem memoizes this alternation in `@@expression`, a class variable with
   * **no key** — safe only because there is one call site. Here each grammar
   * builds its own.
   */
  function buildSymbolAlternation(): Atom {
    const bare: Array<readonly [string, Atom]> = [];
    const slashed: Array<readonly [string, Atom]> = [];
    for (const [text, kind] of LATEX_SYMBOL_CONSTANTS) {
      const atoms = dynamicRules(text, kind);
      if (atoms.bare !== null) {
        if (text.startsWith("\\")) {
          // Never reached with the generated table (`:operant` holds 22 texts,
          // all punctuation). It throws rather than proceeding because the
          // split above would then be unsound in a way no test output would
          // show: a bare alternative sharing the backslash's position would be
          // silently reordered behind every backslashed one.
          throw new Error(
            `createLatexGrammar: the bare alternative ${JSON.stringify(text)} starts with a ` +
              "backslash, so the bare and backslashed groups are no longer disjoint",
          );
        }
        bare.push([text, atoms.bare]);
      }
      slashed.push([text, atoms.slashed]);
    }
    return alt(seq(slash, tokenChoice(slashed)), tokenChoice(bare));
  }

  const symbolAlternation = rule(buildSymbolAlternation);

  const rules: LatexRules = {
    base,
    power,
    slash,
    underOver,
    arrayArgs,
    arrayBegin,
    optionalArgs,
    color,
    begining,
    ending,
    numericValues,
    underoverClasses,
    mathOperatorsClasses,
    lparen,
    rparen,
    leftParens,
    rightParens,
    environment,
    subscript,
    supscript,
    mathOperators,
    sqrtArg,
    limits,
    symbolClassCommands,
    symbolTextOrInteger,
    intermediateExp,
    parsingTextValues,
    powerBase,
    binaryFunctions,
    sequence,
    leftRight,
    overClass,
    iteration,
    expression,
    hexNumber,
    binaryNumber,
    octalNumber,
  };

  return { decimalMarker, encodedDecimalMarker, root: expression, rules };
}

/**
 * One grammar per decimal marker, built on first use.
 *
 * Building it is not cheap — the symbol alternation alone is 3,327 entries —
 * and it is immutable once built, so the parse-time state that would make
 * sharing unsafe (the packrat cache) lives in the per-parse context rather than
 * on the atoms. The cache is keyed by marker, never by locale: two locales that
 * share a marker share a grammar.
 */
const grammarCache = new Map<string, LatexGrammar>();

/** The grammar for a caller's locale, resolved through `formatting`. */
export function latexGrammar(options?: LocaleOptions | null): LatexGrammar {
  const marker = resolveDecimalMarker(options);
  let grammar = grammarCache.get(marker);
  if (grammar === undefined) {
    grammar = createLatexGrammar(marker);
    grammarCache.set(marker, grammar);
  }
  return grammar;
}

/**
 * Parses **preprocessed** LaTeX into a Parslet-shaped tree.
 *
 * Throws `ParseFailed`, whose `index` is a UTF-16 offset into the supplied
 * string — which is the *preprocessed* text, not a caller's input, until the
 * preprocessing slice lands to map it back (ARCHITECTURE.md §5).
 *
 * The gem lets `Parslet::ParseFailed` escape `Latex::Parser#parse` uncaught —
 * there is no `rescue` anywhere under `lib/plurimath/latex/` — so a refusal
 * here is a throw, not a null.
 */
export function parseLatexPreprocessed(preprocessed: string, options?: LocaleOptions | null) {
  return latexGrammar(options).root.parse(preprocessed);
}
