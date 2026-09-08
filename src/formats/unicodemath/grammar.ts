/**
 * The UnicodeMath grammar, ported rule for rule from the gem's Parslet parser
 * (plurimath 0.11.6 at `00c52783`).
 *
 * The port is deliberately structural, exactly as `asciimath/grammar.ts` and
 * `latex/grammar.ts` are: every `rule(:name)` is one `rule(() => ...)` here,
 * with the same alternatives in the same order, and each carries the Ruby line
 * it came from. Parslet's `|` is an ordered choice, so alternative order is
 * behaviour, not style.
 *
 * Unlike LaTeX, this grammar is spread across **six** Ruby files:
 * `unicode_math/parse.rb` holds 57 rules and the rest live in the five
 * `unicode_math/parsing_rules/*.rb` modules it includes — 231 rules in all,
 * plus the three the `BaseNumberPrefix` mixin adds. They are grouped below by
 * the file they came from, in that file's own source order, and every
 * reference names its file so a reader can find the original.
 *
 * Rule names are Ruby's, transliterated to camelCase (`op_build_up` ->
 * `opBuildUp`). Four Ruby names end in `?` and would collide with the rule they
 * wrap, so those four alone gain a `Maybe` suffix (`space?` -> `spaceMaybe`,
 * and likewise `slash?`, `invisible_unicode?`, `exclamation_symbols?`); the
 * other nine `?`-suffixed names simply drop it, because nothing collides.
 * `function` is a reserved word in JavaScript and is `functionRule` here, and
 * Biome's `useNamingConvention` rejects adjacent capitals, so `op_h_bracket`
 * is `opHbracket` and `interval_a_ascii` is `intervalAascii`. Tree *keys*
 * stay Ruby's exactly — they are data, not identifiers.
 *
 * **Three rules are unreachable from the root**, in the gem as much as here:
 * `hbrackPowerBaseCheck`, `spacedBracketedOperand` and `slashMaybe`. Nothing
 * refers to them (`spaced_bracketed_operand` refers only to itself), and
 * `hbrack` inlines the very expression `hbrack_power_base_check` names rather
 * than calling it. They are carried because this is a rule-for-rule port and
 * their absence would be a silent divergence; they are marked where they sit.
 *
 * This module takes **already-preprocessed** text. `UnicodeMath::Parser`
 * entity-encodes its input, reverses five specific encodings, rewrites
 * `\uXXXX` escapes and strips the result before Parslet ever runs; that pass is
 * a separate slice, and until it lands a caller supplies the preprocessed
 * string itself. It is why `decimalMarker` matches an *encoded* marker.
 *
 * There is no transform yet: this produces the Parslet-shaped tree and stops.
 * `unicode_math/transform.rb` is 3,997 lines and is the next slice, which is
 * why `index.ts` still publishes output only and there is no `parseUnicodemath`.
 */

import {
  DEFAULT_DECIMAL_MARKER,
  type LocaleOptions,
  resolveDecimalMarker,
} from "../../formatting/index";
import { type Atom, any, choice, match, rule, seq, str } from "../../pegkit";
import {
  UNICODEMATH_ACCENT_SYMBOLS,
  UNICODEMATH_ACCENT_SYMBOLS_KEYS,
  UNICODEMATH_ALPHANUMERIC_FONTS_CLASSES,
  UNICODEMATH_BINARY_SYMBOLS,
  UNICODEMATH_BINARY_SYMBOLS_KEYS,
  UNICODEMATH_CLOSE_PARENTHESIS,
  UNICODEMATH_CLOSE_SYMBOLS,
  UNICODEMATH_CLOSE_SYMBOLS_KEYS,
  UNICODEMATH_COMBINING_SYMBOLS,
  UNICODEMATH_COMBINING_SYMBOLS_KEYS,
  UNICODEMATH_DIACRITIC_BELOWS,
  UNICODEMATH_DIACRITIC_OVERLAYS,
  UNICODEMATH_ENCODED_DECIMAL_MARKERS,
  UNICODEMATH_FONTS_CLASSES,
  UNICODEMATH_HORIZONTAL_BRACKETS,
  UNICODEMATH_HORIZONTAL_BRACKETS_KEYS,
  UNICODEMATH_MATRIXS,
  UNICODEMATH_MATRIXS_KEYS,
  UNICODEMATH_NARY_SYMBOLS,
  UNICODEMATH_NARY_SYMBOLS_KEYS,
  UNICODEMATH_NEGATABLE_SYMBOLS,
  UNICODEMATH_OPEN_PARENTHESIS,
  UNICODEMATH_OPEN_SYMBOLS,
  UNICODEMATH_OPEN_SYMBOLS_KEYS,
  UNICODEMATH_ORDINARY_SYMBOLS,
  UNICODEMATH_ORDINARY_SYMBOLS_KEYS,
  UNICODEMATH_PREFIXED_NEGATABLE_SYMBOLS,
  UNICODEMATH_RELATIONAL_SYMBOLS,
  UNICODEMATH_RELATIONAL_SYMBOLS_KEYS,
  UNICODEMATH_SIZE_OVERRIDES_SYMBOLS,
  UNICODEMATH_SKIP_SYMBOLS,
  UNICODEMATH_SKIP_SYMBOLS_KEYS,
  UNICODEMATH_SUB_ALPHABETS,
  UNICODEMATH_SUB_CLOSE_PARENTHESIS,
  UNICODEMATH_SUB_DIGITS,
  UNICODEMATH_SUB_OPEN_PARENTHESIS,
  UNICODEMATH_SUB_OPERATORS,
  UNICODEMATH_SUP_ALPHABETS,
  UNICODEMATH_SUP_CLOSE_PARENTHESIS,
  UNICODEMATH_SUP_DIGITS,
  UNICODEMATH_SUP_OPEN_PARENTHESIS,
  UNICODEMATH_SUP_OPERATORS,
  UNICODEMATH_UNARY_ARG_FUNCTIONS,
  UNICODEMATH_UNARY_ARG_FUNCTIONS_KEYS,
  UNICODEMATH_UNARY_FUNCTIONS,
  UNICODEMATH_UNARY_SYMBOLS,
  UNICODEMATH_UNARY_SYMBOLS_KEYS,
  UNICODEMATH_UNICODE_FRACTIONS,
  UNICODEMATH_UNICODED_FONTS,
  UNICODEMATH_WRAPPER_SYMBOLS,
} from "./generated/parser-tables";

/**
 * What Ruby's `\s` means, spelled out — the same substitution
 * `asciimath/grammar.ts` and `latex/grammar.ts` make, for the same measured
 * reason. Ruby's `\s` is six code points; JavaScript's under the `u` flag is
 * twenty-five, adding U+00A0 and eighteen others. `unicode_math/parse.rb:21`
 * writes `match(/\s/)` and a verbatim transcription would swallow characters
 * the gem leaves for the next rule.
 */
const RUBY_SPACE = "\\t\\n\\v\\f\\r ";

/**
 * Parslet's `|`, which is **flat**, not left-nested.
 *
 * `Atoms::Base#|` builds `Alternative.new(self, other)`, but
 * `Alternative#|` builds `self.class.new(*@alternatives, parslet)` — so a
 * chain `a | b | c` is ONE `Alternative` with three branches, not
 * `Alternative(Alternative(a, b), c)`. pegkit's `alt(...)` reduces with `.or()`
 * and nests to the left; `choice([...])` is the flat N-ary atom, so this port
 * uses that everywhere and never `alt`.
 *
 * Atom-graph shape is not cosmetic here: the packrat cache is keyed on
 * (atom, position), so how many atoms a chain is built from decides how many
 * cache entries exist. Using the flat atom keeps that graph the same shape as
 * the gem's.
 *
 * Measured, so the claim is bounded: switching this grammar between `alt` and
 * `choice` changed no verdict and no tree across the 5,127 inputs it was
 * compared on — the corpus, sweep and upstream sets. It is kept because it is
 * what Parslet builds, not because it fixed something; in particular it does
 * NOT fix the two divergences recorded in the spec.
 *
 * A parenthesised alternation on the RIGHT of a `|` does stay nested in Ruby
 * (`a | (b | c)` is `Alternative(a, Alternative(b, c))`, because the receiver
 * `a` is not an Alternative), so nested `ordered(...)` calls here are
 * deliberate and mirror the gem's own parentheses.
 */
function ordered(...atoms: readonly Atom[]): Atom {
  return choice(atoms);
}

/**
 * `arr_to_expression` (`parsing_rules/constants_rules.rb:100`): an ordered
 * choice of literals, each one named.
 *
 * Ruby's `reduce` converts only the first element, because after one iteration
 * the accumulator is an atom rather than a String or Symbol; the effect is that
 * every alternative is `str(x).as(name)`. The one-element branch takes the
 * other path and returns `str(arr.first).as(name)`, which is the same shape, so
 * both collapse to this. The gem's tables hold Symbols as often as Strings and
 * Parslet's `str` calls `to_s` on them; the generated tables are already
 * projected onto Strings, and every entry was parsed back through the gem's own
 * rule to prove the projection is faithful.
 */
function arrToExpression(values: readonly string[], name: string): Atom {
  return ordered(...values.map((value) => str(value).as(name)));
}

/**
 * `hash_values` (`parsing_rules/constants_rules.rb:122`), whose two branches
 * are genuinely different grammars rather than one shape parameterised.
 *
 * A one-entry font contributes a BARE `str(text)` — no `.as`, so it puts
 * nothing in the tree. A many-entry font contributes an alternation of
 * `str(font).absent?.as(font).as(:unicoded_font_class) >> str(text).as(:symbol)`,
 * whose lookahead is zero-width and always succeeds here (the input at that
 * point is an entity, never the font name). Which branch each font takes is
 * measured by the generator, not assumed.
 */
function hashValues(
  fontClass: string,
  entries: ReadonlyArray<readonly [key: string, text: string]>,
): Atom {
  if (entries.length > 1) {
    return ordered(
      ...entries.map(([, text]) =>
        seq(
          str(fontClass).absent().as(fontClass).as("unicoded_font_class"),
          str(text).as("symbol"),
        ),
      ),
    );
  }
  // Ruby reads `expr_hash.values.last`; with one entry that is the only one.
  const [, text] = entries[entries.length - 1] as readonly [string, string];
  return str(text);
}

/** `unicoded_fonts_to_expression` (`parsing_rules/constants_rules.rb:112`). */
function unicodedFontsToExpression(
  fonts: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, string]>]>,
): Atom {
  return ordered(...fonts.map(([fontClass, entries]) => hashValues(fontClass, entries)));
}

/** Every rule in the six Ruby files, plus the three `BaseNumberPrefix` adds. */
export interface UnicodemathRules {
  // --- parsing_rules/constants_rules.rb ---
  readonly slash: Atom;
  readonly slashMaybe: Atom;
  readonly primes: Atom;
  readonly opOpen: Atom;
  readonly opFonts: Atom;
  readonly opClose: Atom;
  readonly opSpaces: Atom;
  readonly opAccent: Atom;
  readonly opMatrixs: Atom;
  readonly opNegated: Atom;
  readonly skipSymbols: Atom;
  readonly opSubAlpha: Atom;
  readonly opSupAlpha: Atom;
  readonly opNaryText: Atom;
  readonly opHbracket: Atom;
  readonly opOpenParen: Atom;
  readonly opSupDigits: Atom;
  readonly opSubDigits: Atom;
  readonly binarySymbols: Atom;
  readonly opCloseParen: Atom;
  readonly binaryNegated: Atom;
  readonly unicodedFonts: Atom;
  readonly wrapperSymbols: Atom;
  readonly opNarySymbols: Atom;
  readonly opOpenUnicode: Atom;
  readonly prefixedPrimes: Atom;
  readonly combinedSymbols: Atom;
  readonly opCloseUnicode: Atom;
  readonly opUnarySymbols: Atom;
  readonly opSubOperators: Atom;
  readonly opSupOperators: Atom;
  readonly opBinarySymbols: Atom;
  readonly opSubOpenParen: Atom;
  readonly opSupOpenParen: Atom;
  readonly opBinaryNegated: Atom;
  readonly opUnaryFunctions: Atom;
  readonly opAccentPrefixed: Atom;
  readonly opSubCloseParen: Atom;
  readonly opSupCloseParen: Atom;
  readonly opPrefixedMatrixs: Atom;
  readonly opDiacriticBelows: Atom;
  readonly opCombinedSymbols: Atom;
  readonly opOrdinarySymbols: Atom;
  readonly opCombinedUnicode: Atom;
  readonly opOrdinaryNegated: Atom;
  readonly opPrefixedNegated: Atom;
  readonly opUnicodeFractions: Atom;
  readonly skipSymbolsPrefixed: Atom;
  readonly opDiacriticOverlays: Atom;
  readonly opRelationalUnicode: Atom;
  readonly opAlphanumericFonts: Atom;
  readonly opHbracketPrefixed: Atom;
  readonly opRelationalSymbols: Atom;
  readonly opUnaryArgFunctions: Atom;
  readonly opPrefixedUnarySymbols: Atom;
  readonly opSizeOverridesSymbols: Atom;
  readonly opBinarySymbolsPrefixed: Atom;
  readonly opPrefixedBinaryNegated: Atom;
  readonly opPrefixedOrdinarySymbols: Atom;
  readonly opPrefixedOrdinaryNegated: Atom;
  readonly opPrefixedUnaryArgFunctions: Atom;
  // --- parsing_rules/common_rules.rb ---
  readonly atom: Atom;
  readonly atoms: Atom;
  readonly entity: Atom;
  readonly operator: Atom;
  readonly opUnary: Atom;
  readonly midSymbols: Atom;
  readonly unarySpaces: Atom;
  readonly customFonts: Atom;
  readonly parsingText: Atom;
  readonly alphanumeric: Atom;
  readonly opHbrackets: Atom;
  readonly naryFunctions: Atom;
  readonly exclamationSymbols: Atom;
  readonly exclamationSymbolsMaybe: Atom;
  readonly miniFraction: Atom;
  readonly binomialFraction: Atom;
  readonly fraction: Atom;
  readonly fonts: Atom;
  readonly unaryArgFunctions: Atom;
  readonly accents: Atom;
  readonly diacriticsAccents: Atom;
  readonly repeatedAccentSymbols: Atom;
  readonly primeSymbols: Atom;
  readonly operand: Atom;
  readonly factor: Atom;
  readonly soperand: Atom;
  readonly bracketedSoperand: Atom;
  readonly infty: Atom;
  // --- parsing_rules/absence_rules.rb ---
  readonly fracBinaryAbsent: Atom;
  readonly nonMatrixsAbsence: Atom;
  readonly subSupBinaryAbsent: Atom;
  readonly absentNegatedUnicodes: Atom;
  readonly fracBinaryAbsentSymbols: Atom;
  readonly binaryNegatedAbsentSymbols: Atom;
  readonly miniFractionExpScriptAbsent: Atom;
  readonly absentChars: Atom;
  readonly absentSlashedValues: Atom;
  readonly otherAbsent: Atom;
  readonly absentNumeratorExpScript: Atom;
  // --- parsing_rules/masked.rb ---
  readonly rect: Atom;
  readonly sqrt: Atom;
  readonly qdrt: Atom;
  readonly cbrt: Atom;
  readonly color: Atom;
  readonly phant: Atom;
  readonly backcolor: Atom;
  readonly cbrtSymbols: Atom;
  readonly qdrtSymbols: Atom;
  readonly rectSymbols: Atom;
  readonly sqrtSymbols: Atom;
  readonly rootSymbols: Atom;
  readonly argFunction: Atom;
  readonly colorSymbols: Atom;
  readonly phantomSymbols: Atom;
  readonly monospaceFonts: Atom;
  readonly backcolorSymbols: Atom;
  readonly maskedRecursiveValue: Atom;
  readonly rootInvisibleCharacter: Atom;
  readonly nthrt: Atom;
  readonly binaryRoot: Atom;
  readonly intentFunction: Atom;
  // --- parsing_rules/sub_sup.rb ---
  readonly above: Atom;
  readonly below: Atom;
  readonly subscript: Atom;
  readonly supscript: Atom;
  readonly subOrSup: Atom;
  readonly baseSymbol: Atom;
  readonly baseSyntax: Atom;
  readonly alphaAscii: Atom;
  readonly scriptBase: Atom;
  readonly powerSymbol: Atom;
  readonly powerSyntax: Atom;
  readonly subOverride: Atom;
  readonly supOverride: Atom;
  readonly subSupParen: Atom;
  readonly preSubscript: Atom;
  readonly preSupscript: Atom;
  readonly miniSubValue: Atom;
  readonly miniSupValue: Atom;
  readonly preScriptBase: Atom;
  readonly subSupOverride: Atom;
  readonly operatorSymbols: Atom;
  readonly invisibleSpace: Atom;
  readonly prescriptValues: Atom;
  readonly powerBaseScript: Atom;
  readonly miniSubSupPresent: Atom;
  readonly subscriptValue: Atom;
  readonly supscriptValue: Atom;
  readonly preSubSupOverride: Atom;
  readonly naryandRecursion: Atom;
  readonly baselessSub: Atom;
  readonly baselessSup: Atom;
  readonly recursiveBaselessSupExp: Atom;
  readonly recursiveBaselessSubExp: Atom;
  readonly naryandValues: Atom;
  readonly miniSubSup: Atom;
  readonly narySubSup: Atom;
  readonly unarySubSup: Atom;
  readonly baseValue: Atom;
  readonly subsup: Atom;
  readonly miniSubsup: Atom;
  readonly accentsSubsup: Atom;
  readonly miniPowerBase: Atom;
  readonly miniValues: Atom;
  readonly expScript: Atom;
  readonly preSubsup: Atom;
  readonly subSupOperand: Atom;
  readonly subAlphaDigits: Atom;
  readonly supAlphaDigits: Atom;
  readonly subParen: Atom;
  readonly supParen: Atom;
  readonly subSupValues: Atom;
  readonly alphaNumericValues: Atom;
  // --- unicode_math/parse.rb ---
  readonly an: Atom;
  readonly box: Atom;
  readonly char: Atom;
  readonly rows: Atom;
  readonly space: Atom;
  readonly other: Atom;
  readonly spaceMaybe: Atom;
  readonly digits: Atom;
  readonly opNary: Atom;
  readonly nAscii: Atom;
  readonly aAscii: Atom;
  readonly unicode: Atom;
  readonly anMath: Atom;
  readonly tdValue: Atom;
  readonly anOther: Atom;
  readonly functionRule: Atom;
  readonly opArray: Atom;
  readonly opOpener: Atom;
  readonly opCloser: Atom;
  readonly opDecimal: Atom;
  readonly diacritics: Atom;
  readonly openParen: Atom;
  readonly matrixOnly: Atom;
  readonly closeParen: Atom;
  readonly diacriticbase: Atom;
  readonly forwardSlash: Atom;
  readonly rootFunctions: Atom;
  readonly opOverChoose: Atom;
  readonly opMaskedOpen: Atom;
  readonly invisibleTimes: Atom;
  readonly ordinarySymbols: Atom;
  readonly intervalAascii: Atom;
  readonly negatableSymbols: Atom;
  readonly invisibleUnicode: Atom;
  readonly invisibleUnicodeMaybe: Atom;
  readonly relationalSymbols: Atom;
  readonly hbrackPowerBaseCheck: Atom;
  readonly spacedBracketedOperand: Atom;
  readonly hbrack: Atom;
  readonly negated: Atom;
  readonly opOver: Atom;
  readonly elementExpScriptValidation: Atom;
  readonly spacedExpBracket: Atom;
  readonly row: Atom;
  readonly array: Atom;
  readonly slashedOperator: Atom;
  readonly number: Atom;
  readonly numerator: Atom;
  readonly opBuildUp: Atom;
  readonly expBracket: Atom;
  readonly intervalExpBracket: Atom;
  readonly intervalValue: Atom;
  readonly mixBracketed: Atom;
  readonly denominator: Atom;
  readonly opMaskedClose: Atom;
  readonly element: Atom;
  readonly expression: Atom;
  // --- base_number_prefix.rb ---
  readonly hexNumber: Atom;
  readonly binaryNumber: Atom;
  readonly octalNumber: Atom;
}

export interface UnicodemathGrammar {
  /** The caller's decimal marker, before encoding. */
  readonly decimalMarker: string;
  /** What `decimal_marker` (`unicode_math/parse.rb:290`) actually matches. */
  readonly encodedDecimalMarker: string;
  /** `root :expression` (`unicode_math/parse.rb:288`). */
  readonly root: Atom;
  readonly rules: UnicodemathRules;
}

/**
 * Builds one parser for one decimal marker.
 *
 * The marker is a constructor parameter rather than a global because
 * `decimal_marker` (`unicode_math/parse.rb:290`) reads
 * `Plurimath.configuration.decimal`, and the gem builds a fresh `Parse` for
 * every call (`unicode_math/parser.rb:25`), so the marker is effectively a
 * per-parse input.
 */
export function createUnicodemathGrammar(
  decimalMarker: string = DEFAULT_DECIMAL_MARKER,
): UnicodemathGrammar {
  /**
   * `decimal_marker` (`unicode_math/parse.rb:290`), which does not match the
   * marker: it matches `Utility.string_to_html_entity(marker)`, because
   * `UnicodeMath::Parser#initialize` entity-encodes the input before Parslet
   * sees it. `.` and `,` encode to themselves; `ar`/`fa`'s U+066B encodes to
   * the seven characters `&#x66b;`, and a grammar matching the raw code point
   * would never fire.
   *
   * Note this marker is *additive*, not exclusive: `opDecimal` below is
   * `decimalMarker | "," | "."`, so a comma and a full stop are decimal markers
   * under every locale. That is the gem's shape and the generator asserts it.
   */
  const encodedDecimalMarker = UNICODEMATH_ENCODED_DECIMAL_MARKERS.get(decimalMarker);
  if (encodedDecimalMarker === undefined) {
    // Unreachable through `resolveDecimalMarker`, whose result is always one of
    // the generated table's keys — asserted in
    // `test/formats/unicodemath/parser-tables.spec.ts`. It throws rather than
    // falling back to the raw marker because that fallback is the
    // silent-disaster branch: under `ar` it would build a grammar matching a
    // character the preprocessed input can never contain.
    throw new Error(
      `createUnicodemathGrammar: no encoded form for decimal marker ${JSON.stringify(decimalMarker)}`,
    );
  }
  const decimalMarkerAtom = (): Atom => str(encodedDecimalMarker);

  // === parsing_rules/constants_rules.rb ====================================

  const slash = rule(() => str("\\"));
  /** `constants_rules.rb:10`. Unreachable: nothing refers to it. */
  const slashMaybe = rule(() => slash.maybe());
  const primes = rule(() =>
    ordered(
      str("&#x2057;"),
      str("&#x2034;"),
      str("&#x2033;"),
      str("&#x2032;"),
      str("&#x27;"),
      str("'"),
    ),
  );

  const opOpen = rule(() =>
    seq(slash, arrToExpression(UNICODEMATH_OPEN_SYMBOLS_KEYS, "open_paren")),
  );
  const opFonts = rule(() => seq(slash, arrToExpression(UNICODEMATH_FONTS_CLASSES, "font_class")));
  const opClose = rule(() =>
    seq(slash, arrToExpression(UNICODEMATH_CLOSE_SYMBOLS_KEYS, "close_paren")),
  );

  const opSpaces = rule(() => ordered(skipSymbols, skipSymbolsPrefixed));
  const opAccent = rule(() => arrToExpression(UNICODEMATH_ACCENT_SYMBOLS, "accent_symbols"));

  const opMatrixs = rule(() => arrToExpression(UNICODEMATH_MATRIXS, "matrixs"));
  const opNegated = rule(() => arrToExpression(UNICODEMATH_NEGATABLE_SYMBOLS, "negated_operator"));

  const skipSymbols = rule(() => arrToExpression(UNICODEMATH_SKIP_SYMBOLS, "spaces"));
  const opSubAlpha = rule(() => arrToExpression(UNICODEMATH_SUB_ALPHABETS, "sub_alpha"));
  const opSupAlpha = rule(() => arrToExpression(UNICODEMATH_SUP_ALPHABETS, "sup_alpha"));
  const opNaryText = rule(() =>
    seq(slash, arrToExpression(UNICODEMATH_NARY_SYMBOLS_KEYS, "nary_class")),
  );
  const opHbracket = rule(() => arrToExpression(UNICODEMATH_HORIZONTAL_BRACKETS, "hbracket_class"));

  const opOpenParen = rule(() => arrToExpression(UNICODEMATH_OPEN_PARENTHESIS, "open_paren"));
  const opSupDigits = rule(() => arrToExpression(UNICODEMATH_SUP_DIGITS, "sup_digits"));
  const opSubDigits = rule(() => arrToExpression(UNICODEMATH_SUB_DIGITS, "sub_digits"));

  const binarySymbols = rule(() => ordered(opBinarySymbols, opBinarySymbolsPrefixed));
  const opCloseParen = rule(() => arrToExpression(UNICODEMATH_CLOSE_PARENTHESIS, "close_paren"));
  const binaryNegated = rule(() =>
    seq(binaryNegatedAbsentSymbols, ordered(opBinaryNegated, opPrefixedBinaryNegated)),
  );
  const unicodedFonts = rule(() => unicodedFontsToExpression(UNICODEMATH_UNICODED_FONTS));

  /**
   * `constants_rules.rb:43`. `Constants.wrapper_symbols` is not a hand-written
   * table: it is every `INPUT[:unicodemath]` key shaped like `"P{name}"`, which
   * is what `Symbol.parsing_wrapper` renders for a symbol the gem cannot spell
   * in UnicodeMath. These are placeholders that round-trip, not real notation.
   */
  const wrapperSymbols = rule(() => arrToExpression(UNICODEMATH_WRAPPER_SYMBOLS, "symbol"));
  const opNarySymbols = rule(() => arrToExpression(UNICODEMATH_NARY_SYMBOLS, "nary_class"));
  const opOpenUnicode = rule(() => arrToExpression(UNICODEMATH_OPEN_SYMBOLS, "open_paren"));
  /**
   * `constants_rules.rb:48`. Written out in the gem rather than built from
   * `Constants::PREFIXED_PRIMES`, whose keys happen to be these four in this
   * order — so the constant is not a grammar input and is not generated.
   */
  const prefixedPrimes = rule(() =>
    ordered(str("pppprime"), str("ppprime"), str("pprime"), str("prime")),
  );

  const combinedSymbols = rule(() => ordered(opCombinedSymbols, opCombinedUnicode));
  const opCloseUnicode = rule(() => arrToExpression(UNICODEMATH_CLOSE_SYMBOLS, "close_paren"));
  const opUnarySymbols = rule(() => arrToExpression(UNICODEMATH_UNARY_SYMBOLS, "unary_symbols"));
  const opSubOperators = rule(() => arrToExpression(UNICODEMATH_SUB_OPERATORS, "sub_operators"));
  const opSupOperators = rule(() => arrToExpression(UNICODEMATH_SUP_OPERATORS, "sup_operators"));

  const opBinarySymbols = rule(() => arrToExpression(UNICODEMATH_BINARY_SYMBOLS, "binary_symbols"));
  const opSubOpenParen = rule(() =>
    arrToExpression(UNICODEMATH_SUB_OPEN_PARENTHESIS, "sub_open_paren"),
  );
  const opSupOpenParen = rule(() =>
    arrToExpression(UNICODEMATH_SUP_OPEN_PARENTHESIS, "sup_open_paren"),
  );
  /** The same array as `opBinarySymbols`, under a different tag. */
  const opBinaryNegated = rule(() =>
    arrToExpression(UNICODEMATH_BINARY_SYMBOLS, "binary_negated_operator"),
  );

  const opUnaryFunctions = rule(() =>
    arrToExpression(UNICODEMATH_UNARY_FUNCTIONS, "unary_functions"),
  );
  const opAccentPrefixed = rule(() =>
    seq(slash, arrToExpression(UNICODEMATH_ACCENT_SYMBOLS_KEYS, "accent_symbols")),
  );
  const opSubCloseParen = rule(() =>
    arrToExpression(UNICODEMATH_SUB_CLOSE_PARENTHESIS, "sub_close_paren"),
  );
  const opSupCloseParen = rule(() =>
    arrToExpression(UNICODEMATH_SUP_CLOSE_PARENTHESIS, "sup_close_paren"),
  );

  const opPrefixedMatrixs = rule(() =>
    seq(slash, arrToExpression(UNICODEMATH_MATRIXS_KEYS, "matrixs")),
  );
  const opDiacriticBelows = rule(() =>
    arrToExpression(UNICODEMATH_DIACRITIC_BELOWS, "diacritic_belows"),
  );
  const opCombinedSymbols = rule(() =>
    arrToExpression(UNICODEMATH_COMBINING_SYMBOLS_KEYS, "combined_symbols"),
  );
  const opOrdinarySymbols = rule(() =>
    arrToExpression(UNICODEMATH_ORDINARY_SYMBOLS, "ordinary_symbols"),
  );
  const opCombinedUnicode = rule(() =>
    arrToExpression(UNICODEMATH_COMBINING_SYMBOLS, "combined_symbols"),
  );
  /** The same array as `opOrdinarySymbols`, under a different tag. */
  const opOrdinaryNegated = rule(() =>
    arrToExpression(UNICODEMATH_ORDINARY_SYMBOLS, "ordinary_negated_operator"),
  );
  const opPrefixedNegated = rule(() =>
    seq(slash, arrToExpression(UNICODEMATH_PREFIXED_NEGATABLE_SYMBOLS, "negated_operator")),
  );

  const opUnicodeFractions = rule(() =>
    arrToExpression(UNICODEMATH_UNICODE_FRACTIONS, "unicode_fractions"),
  );
  const skipSymbolsPrefixed = rule(() =>
    seq(slash, arrToExpression(UNICODEMATH_SKIP_SYMBOLS_KEYS, "spaces")),
  );
  const opDiacriticOverlays = rule(() =>
    arrToExpression(UNICODEMATH_DIACRITIC_OVERLAYS, "diacritic_overlays"),
  );
  const opRelationalUnicode = rule(() =>
    arrToExpression(UNICODEMATH_RELATIONAL_SYMBOLS, "relational_symbols"),
  );
  const opAlphanumericFonts = rule(() =>
    seq(slash, arrToExpression(UNICODEMATH_ALPHANUMERIC_FONTS_CLASSES, "font_class")),
  );
  const opHbracketPrefixed = rule(() =>
    seq(slash, arrToExpression(UNICODEMATH_HORIZONTAL_BRACKETS_KEYS, "hbracket_class")),
  );
  const opRelationalSymbols = rule(() =>
    seq(slash, arrToExpression(UNICODEMATH_RELATIONAL_SYMBOLS_KEYS, "relational_symbols")),
  );

  const opUnaryArgFunctions = rule(() =>
    arrToExpression(UNICODEMATH_UNARY_ARG_FUNCTIONS, "unary_arg_functions"),
  );

  const opPrefixedUnarySymbols = rule(() =>
    seq(slash, arrToExpression(UNICODEMATH_UNARY_SYMBOLS_KEYS, "unary_symbols")),
  );
  const opSizeOverridesSymbols = rule(() =>
    seq(str("&#x2132;"), arrToExpression(UNICODEMATH_SIZE_OVERRIDES_SYMBOLS, "size_overrides")),
  );

  const opBinarySymbolsPrefixed = rule(() =>
    seq(slash, arrToExpression(UNICODEMATH_BINARY_SYMBOLS_KEYS, "binary_symbols")),
  );
  const opPrefixedBinaryNegated = rule(() =>
    seq(slash, arrToExpression(UNICODEMATH_BINARY_SYMBOLS_KEYS, "binary_negated_operator")),
  );

  const opPrefixedOrdinarySymbols = rule(() =>
    seq(slash, arrToExpression(UNICODEMATH_ORDINARY_SYMBOLS_KEYS, "ordinary_symbols")),
  );
  const opPrefixedOrdinaryNegated = rule(() =>
    seq(slash, arrToExpression(UNICODEMATH_ORDINARY_SYMBOLS_KEYS, "ordinary_negated_operator")),
  );

  const opPrefixedUnaryArgFunctions = rule(() =>
    seq(slash, arrToExpression(UNICODEMATH_UNARY_ARG_FUNCTIONS_KEYS, "unary_arg_functions")),
  );

  // === parsing_rules/common_rules.rb =======================================

  const atom = rule(() => ordered(seq(diacritics, diacriticbase.maybe()), an));
  const atoms = rule(() => seq(atom.as("atom"), atoms.as("atoms").maybe()));
  const entity = rule(() => ordered(atoms, number));

  const operator = rule(() => match("[-+*=.?:,`]").as("operator"));
  const opUnary = rule(() =>
    ordered(
      opPrefixedUnaryArgFunctions,
      opUnaryArgFunctions,
      opPrefixedUnarySymbols,
      opUnarySymbols,
    ),
  );

  const midSymbols = rule(() =>
    ordered(seq(slash, str("mid").as("mid_symbol")), str("&#x2223;").as("mid_symbol")),
  );

  const unarySpaces = rule(() => ordered(space, invisibleUnicode));
  const customFonts = rule(() => ordered(str("double"), str("fraktur"), str("script")));
  const parsingText = rule(() => seq(str('"'), match('[^"]').repeat(1).as("text"), str('"')));
  /**
   * `common_rules.rb:27`. Ruby writes the ranges as `\u{...}` escapes inside a
   * double-quoted String, so each is the literal character: A-Z, a-z,
   * U+0391-U+2207, U+03B1-U+03DD and 0-9. The third range is very wide and
   * subsumes the fourth; that is the gem's, and is carried unchanged.
   */
  const alphanumeric = rule(() =>
    match(
      "[\\u{0041}-\\u{005A}\\u{0061}-\\u{007A}\\u{0391}-\\u{2207}\\u{3B1}-\\u{3DD}\\u{30}-\\u{39}]",
    ),
  );

  const opHbrackets = rule(() => ordered(opHbracket, opHbracketPrefixed));
  const naryFunctions = rule(() =>
    ordered(seq(opUnary, unarySpaces.maybe()), seq(opUnaryFunctions, unarySpaces)),
  );
  const exclamationSymbols = rule(() => ordered(str("!"), str("!!")).as("exclamation_symbol"));
  const exclamationSymbolsMaybe = rule(() => exclamationSymbols.maybe());

  const miniFraction = rule(() =>
    seq(
      supParen.as("mini_numerator"),
      seq(negatableSymbols.absent(), opOver),
      subParen.as("mini_denominator"),
    ),
  );

  const binomialFraction = rule(() =>
    seq(numerator.as("numerator"), opOverChoose, denominator.as("denominator")),
  );

  const fraction = rule(() =>
    ordered(
      miniFraction,
      binomialFraction,
      seq(
        numerator.as("numerator"),
        spaceMaybe,
        seq(negatableSymbols.absent(), opOver),
        spaceMaybe,
        denominator.as("denominator"),
      ),
    ),
  );

  const fonts = rule(() =>
    ordered(
      unicodedFonts,
      seq(str("\\"), customFonts.as("unicoded_font_class"), str("H").as("symbol")),
      seq(str("\\"), str("mitBbb").as("unicoded_font_class"), match("[Ddeij]").as("symbol")),
      seq(opFonts, match("[A-Za-z]").as("symbol")),
      seq(
        opAlphanumericFonts,
        ordered(match("[A-Za-z]").as("symbol"), match("[0-9]").as("number")),
      ),
    ),
  );

  const unaryArgFunctions = rule(() =>
    ordered(
      seq(opUnaryFunctions, spaceMaybe, ordered(soperand, expBracket).as("first_value").maybe()),
      seq(naryFunctions, spaceMaybe, ordered(expBracket, soperand).as("first_value")).as(
        "unary_function",
      ),
    ),
  );

  const accents = rule(() =>
    ordered(
      seq(
        expBracket.as("intermediate_exp").as("first_value"),
        str("&#xa0;").maybe(),
        repeatedAccentSymbols,
      ).as("accents"),
      seq(
        str("&#xa0;").absent(),
        factor.as("first_value"),
        str("&#xa0;").maybe(),
        repeatedAccentSymbols,
      ).as("accents"),
    ),
  );

  const diacriticsAccents = rule(() =>
    ordered(
      seq(operand.as("first_value"), opDiacriticOverlays.as("overlay_after")).as(
        "diacritics_accents",
      ),
      seq(operand.as("first_value"), opDiacriticBelows.as("below_after")).as("diacritics_accents"),
      seq(opDiacriticBelows.as("below_before"), operand.as("first_value")).as("diacritics_accents"),
      seq(opDiacriticOverlays.as("overlay_before"), operand.as("first_value")).as(
        "diacritics_accents",
      ),
    ),
  );

  const repeatedAccentSymbols = rule(() =>
    ordered(seq(ordered(opAccent, opAccentPrefixed).repeat(1), primeSymbols.maybe()), primeSymbols),
  );

  const primeSymbols = rule(() =>
    ordered(seq(slash, prefixedPrimes.as("prefixed_prime")), primes)
      .repeat(1)
      .as("prime_accent_symbols"),
  );

  const operand = rule(() =>
    ordered(
      rect,
      phant,
      accents,
      negatableSymbols,
      fonts.as("fonts"),
      wrapperSymbols,
      seq(ordered(parsingText, factor.as("factor")), operand.as("operand").maybe()),
    ),
  );

  const factor = rule(() =>
    ordered(
      combinedSymbols,
      seq(
        seq(str("&#x2212;").absent(), opUnaryFunctions.absent()),
        entity,
        exclamationSymbolsMaybe,
      ),
      color,
      seq(expBracket.as("intermediate_exp"), exclamationSymbolsMaybe),
      functionRule,
      backcolor,
      opSpaces,
      monospaceFonts,
      relationalSymbols,
      unaryArgFunctions,
      seq(opUnaryFunctions, unarySpaces, ordered(operand, expBracket).absent()),
      wrapperSymbols,
      ordinarySymbols,
      negatableSymbols,
      str("...").as("ldots").as("symbol"),
      exclamationSymbols,
    ),
  );

  const soperand = rule(() =>
    ordered(
      operand,
      infty.as("infty"),
      seq(str("-"), infty).as("symbol"),
      str("&#x2212;").as("symbol"),
      str("-").as("symbol"),
      operator,
    ),
  );

  const bracketedSoperand = rule(() =>
    ordered(
      seq(
        opOpener.as("opener"),
        spaceMaybe,
        soperand.as("operand"),
        spaceMaybe,
        opCloser.as("closer"),
      ).as("int_exp"),
      soperand.as("operand"),
    ),
  );

  const infty = rule(() => str("&#x221e;"));

  // === parsing_rules/absence_rules.rb ======================================

  const fracBinaryAbsent = rule(() => seq(fracBinaryAbsentSymbols, binarySymbols));

  const nonMatrixsAbsence = rule(() =>
    ordered(str("eqarray"), str("&#x2588;"), str("cases"), str("&#x24b8;")).absent(),
  );

  const subSupBinaryAbsent = rule(() =>
    seq(ordered(seq(slash, str("times")), str("&#xd7;")).absent(), binarySymbols),
  );

  const absentNegatedUnicodes = rule(() => ordered(sqrtSymbols, rootSymbols));

  /**
   * `absence_rules.rb:23`. `str("&#x2260")` really is missing its trailing
   * semicolon in the gem, where every neighbouring entity has one. Carried
   * verbatim: this rule is a negative lookahead, so the typo makes it fire on a
   * prefix of the intended entity rather than on the entity, and "fix" it here
   * and the port stops matching the oracle.
   */
  const fracBinaryAbsentSymbols = rule(() =>
    ordered(
      seq(slash, ordered(str("times"), str("neq"), str("ne"))),
      ordered(str("&#xd7;"), str("&#x2260")),
    ).absent(),
  );

  const binaryNegatedAbsentSymbols = rule(() =>
    ordered(seq(slash, str("dd")), str("&#x2146;")).absent(),
  );

  const miniFractionExpScriptAbsent = rule(() => seq(operator, miniFraction).absent());

  const absentChars = rule(() =>
    ordered(
      opUnaryArgFunctions,
      opDiacriticOverlays,
      opUnicodeFractions,
      opDiacriticBelows,
      opOrdinarySymbols,
      relationalSymbols,
      opSubCloseParen,
      opSupCloseParen,
      opSubOpenParen,
      opSupOpenParen,
      opBinarySymbols,
      invisibleUnicode,
      opUnarySymbols,
      opSubOperators,
      opSupOperators,
      opCloseUnicode,
      str("&#x2534;"),
      str("&#x252c;"),
      str("&#x2524;"),
      str("&#x251c;"),
      str("&#x270e;"),
      str("&#x2062;"),
      str("&#x2044;"),
      str("&#x2061;"),
      str("&#x2601;"),
      str("&#x2592;"),
      str("&#x249e;"),
      str("&#x2298;"),
      opOpenUnicode,
      opNarySymbols,
      str("&#x221a;"),
      str("&#x221b;"),
      str("&#x221c;"),
      str("&#x24ad;"),
      str("&#x25ad;"),
      str("&#xffd7;"),
      str("&#x24d0;"),
      str("&#x24d8;"),
      str("&#x2223;"),
      str("&#x2215;"),
      unicodedFonts,
      str("&#x20;"),
      str("&#x27;"),
      str("&#x2f;"),
      str("&#xac;"),
      str("&#xa6;"),
      opSupDigits,
      opSubDigits,
      opSupAlpha,
      opSubAlpha,
      opHbracket,
      skipSymbols,
      opMatrixs,
      opAccent,
      primes,
    ).absent(),
  );

  const absentSlashedValues = rule(() =>
    ordered(
      opPrefixedUnaryArgFunctions,
      opPrefixedOrdinarySymbols,
      opBinarySymbolsPrefixed,
      opPrefixedUnarySymbols,
      seq(slash, str("backcolor")),
      seq(slash, str("naryand")),
      seq(slash, str("sdivide")),
      seq(slash, str("oslash")),
      seq(slash, str("color")),
      opRelationalSymbols,
      opHbracketPrefixed,
      opAlphanumericFonts,
      skipSymbolsPrefixed,
      seq(slash, str("sfrac")),
      seq(slash, str("rect")),
      seq(slash, str("sqrt")),
      seq(slash, str("qdrt")),
      seq(slash, str("cbrt")),
      seq(slash, str("root")),
      seq(slash, str("sdiv")),
      seq(slash, str("ndiv")),
      seq(slash, str("ldiv")),
      opPrefixedMatrixs,
      // `op_binary_symbols_prefixed` a second time, as in the gem: the repeat is
      // unreachable in an ordered choice and is carried rather than tidied.
      opBinarySymbolsPrefixed,
      opPrefixedNegated,
      seq(slash, str("mid")),
      opAccentPrefixed,
      prefixedPrimes,
      opNaryText,
      str("\\of"),
      opClose,
      opFonts,
      opOpen,
    ).absent(),
  );

  const otherAbsent = rule(() =>
    ordered(an.as("other_exp"), opBuildUp, match("\\r"), nAscii, char).absent(),
  );

  const absentNumeratorExpScript = rule(() =>
    ordered(
      seq(
        powerBaseScript.as("nary_sub_sup"),
        invisibleSpace,
        naryandRecursion.as("naryand"),
      ).absent(),
      seq(opNary, invisibleSpace, naryandRecursion.as("naryand").maybe()).absent(),
    ),
  );

  // === parsing_rules/masked.rb =============================================

  const maskedValue = (funcName: string): Atom =>
    seq(
      match("[^&]").repeat(1).as(`${funcName}_value`),
      str("&"),
      maskedRecursiveValue.as("first_value"),
    );

  const bracketedMaskedValue = (funcName: string): Atom =>
    seq(str("("), maskedValue(funcName).as(funcName), str(")"));

  const rect = rule(() => seq(rectSymbols, spaceMaybe, bracketedMaskedValue("rect")));
  const sqrt = rule(() =>
    seq(sqrtSymbols.as("root_symbol"), ordered(expScript, operand).as("first_value")).as("root"),
  );
  const qdrt = rule(() =>
    seq(qdrtSymbols.as("root_symbol"), ordered(expScript, operand).as("first_value")).as("root"),
  );
  const cbrt = rule(() =>
    seq(cbrtSymbols.as("root_symbol"), ordered(expScript, operand).as("first_value")).as("root"),
  );

  const color = rule(() => seq(colorSymbols, spaceMaybe, bracketedMaskedValue("color")));
  const phant = rule(() => seq(phantomSymbols, spaceMaybe, bracketedMaskedValue("phantom")));
  const backcolor = rule(() =>
    seq(backcolorSymbols, spaceMaybe, bracketedMaskedValue("backcolor")),
  );

  const cbrtSymbols = rule(() => ordered(str("&#x221b;"), str("\\cbrt")));
  /**
   * `masked.rb:32`. The gem's fourth-root rule really does spell its command
   * `\cbrt`, not `\qdrt`, so `\qdrt` reaches `qdrt` only through
   * `absent_slashed_values`. Carried verbatim.
   */
  const qdrtSymbols = rule(() => ordered(str("&#x221c;"), str("\\cbrt")));
  const rectSymbols = rule(() => ordered(str("&#x25ad;"), str("\\rect")));
  const sqrtSymbols = rule(() => ordered(str("&#x221a;"), str("\\sqrt"), str("\\surd")));
  const rootSymbols = rule(() =>
    ordered(str("&#x24ad;"), str("&#x221a;"), str("\\root"), str("\\surd")),
  );

  const argFunction = rule(() =>
    ordered(
      seq(
        str("&#x24d0;").as("arg"),
        str("("),
        aAscii.as("arg_arguments").maybe(),
        spaceMaybe,
        expression.as("first_value").maybe(),
        str(")"),
      ),
      seq(
        str("&#x24d0;").as("arg"),
        aAscii.as("arg_arguments").maybe(),
        spaceMaybe,
        expression.as("first_value").maybe(),
      ),
    ),
  );

  const colorSymbols = rule(() => ordered(str("&#x270e;"), str("\\color")));
  const phantomSymbols = rule(() => ordered(str("&#x27e1;"), str("\\phantom")));
  const monospaceFonts = rule(() =>
    seq(
      str("&#xffd7;"),
      str("("),
      spaceMaybe,
      expression.as("monospace_value"),
      spaceMaybe,
      str(")"),
    ).as("monospace"),
  );

  const backcolorSymbols = rule(() => ordered(str("&#x2601;"), str("\\backcolor")));
  const maskedRecursiveValue = rule(() =>
    seq(
      ordered(seq(spaceMaybe, expression), expBracket, expScript).as("expr"),
      maskedRecursiveValue.as("func_expr").maybe(),
    ),
  );

  const rootInvisibleCharacter = rule(() =>
    seq(str("\\naryand").absent(), invisibleUnicode).maybe(),
  );

  const nthrt = rule(() =>
    seq(
      sqrtSymbols,
      str("("),
      maskedRecursiveValue.as("first_value"),
      str("&"),
      maskedRecursiveValue.as("second_value"),
      str(")"),
    ).as("root"),
  );

  const binaryRoot = rule(() =>
    seq(
      rootSymbols,
      spaceMaybe,
      maskedRecursiveValue.as("root_first_value"),
      spaceMaybe,
      rootInvisibleCharacter,
      spaceMaybe,
      maskedRecursiveValue.as("root_second_value"),
    ),
  );

  const intentFunction = rule(() =>
    ordered(
      seq(
        str("&#x24d8;").as("intent"),
        str("(").as("open_paren"),
        parsingText.as("intent_arguments").maybe(),
        spaceMaybe,
        expression.as("first_value").maybe(),
        str(")").as("close_paren"),
      ),
      seq(str("&#x24d8;").as("intent"), expression.as("intent_expr")),
    ),
  );

  // === parsing_rules/sub_sup.rb ============================================

  const parenWrapRule = (passedRule: Atom): Atom =>
    ordered(seq(opOpener, spaceMaybe, passedRule, spaceMaybe, opCloser), passedRule);

  const baselessSubValues = (soperandName: string): Atom =>
    ordered(
      seq(
        ordered(miniSubSup, subSupParen).as(soperandName),
        recursiveBaselessSubExp.maybe(),
        subSupValues.maybe(),
      ),
      seq(subSupValues.as(soperandName), recursiveBaselessSubExp.maybe()),
    );

  const baselessSupValues = (soperandName: string): Atom =>
    ordered(
      seq(
        ordered(miniSubSup, subSupParen).as(soperandName),
        recursiveBaselessSupExp.maybe(),
        subSupValues.maybe(),
      ),
      seq(subSupValues.as(soperandName), recursiveBaselessSupExp.maybe()),
    );

  const above = rule(() => ordered(str("&#x2534;"), str("\\above")).as("over"));
  const below = rule(() => ordered(str("&#x252c;"), str("\\below")).as("under"));

  const subscript = rule(() => seq(baseValue, subscriptValue));
  const supscript = rule(() => seq(baseValue, supscriptValue));

  const subOrSup = rule(() => ordered(subscript, supscript));
  const baseSymbol = rule(() => str("_"));
  const baseSyntax = rule(() => ordered(baseSymbol, below));
  const alphaAscii = rule(() => match("[A-Za-z]").as("symbol"));
  const scriptBase = rule(() => ordered(miniSubSup, subSupOperand));

  const powerSymbol = rule(() => str("^"));
  const powerSyntax = rule(() => ordered(powerSymbol, above));
  const subOverride = rule(() =>
    seq(
      invisibleSpace,
      baseSyntax,
      opSizeOverridesSymbols,
      seq(operatorSymbols.maybe(), baselessSubValues("sub_script")),
    ),
  );
  const supOverride = rule(() =>
    seq(
      invisibleSpace,
      powerSyntax,
      opSizeOverridesSymbols,
      seq(operatorSymbols.maybe(), baselessSupValues("sup_script")),
    ),
  );

  const subSupParen = rule(() => ordered(subParen.as("sub_paren"), supParen.as("sup_paren")));
  const preSubscript = rule(() =>
    ordered(seq(baseSyntax, prescriptValues.as("pre_subscript")), subParen.as("pre_subscript")),
  );
  const preSupscript = rule(() =>
    ordered(seq(powerSyntax, prescriptValues.as("pre_supscript")), supParen.as("pre_supscript")),
  );

  const miniSubValue = rule(() => seq(subSupOperand.as("base"), subParen.as("sub")).as("mini_sub"));
  const miniSupValue = rule(() => seq(subSupOperand.as("base"), supParen.as("sup")).as("mini_sup"));

  const preScriptBase = rule(() =>
    seq(operand.as("base"), ordered(subsup, miniSubsup, subscriptValue, supscriptValue).maybe()),
  );

  const subSupOverride = rule(() => ordered(subOverride, supOverride));
  const operatorSymbols = rule(() => ordered(combinedSymbols, negatableSymbols, operator));
  const invisibleSpace = rule(() => seq(invisibleUnicodeMaybe, invisibleTimes.maybe()).maybe());
  const prescriptValues = rule(() => ordered(operand, miniSubSup, operatorSymbols, binarySymbols));

  const powerBaseScript = rule(() =>
    ordered(
      seq(baseValue, subsup).as("subsup_exp"),
      subscript.as("sub_exp"),
      supscript.as("sup_exp"),
    ),
  );

  const miniSubSupPresent = rule(() =>
    ordered(miniSubValue.present(), miniSupValue.present(), miniSubsup.present()),
  );

  const subscriptValue = rule(() =>
    seq(ordered(subParen, baselessSub.as("sub")), recursiveBaselessSubExp.maybe()),
  );

  const supscriptValue = rule(() =>
    seq(ordered(supParen, baselessSup.as("sup")), recursiveBaselessSupExp.maybe()),
  );

  const preSubSupOverride = rule(() =>
    ordered(
      seq(baseSyntax, opSizeOverridesSymbols, prescriptValues.as("pre_subscript")),
      seq(powerSyntax, opSizeOverridesSymbols, prescriptValues.as("pre_supscript")),
    ),
  );

  const naryandRecursion = rule(() =>
    ordered(
      seq(operator.absent(), naryandValues, naryandRecursion.as("naryand_recursion").maybe()),
      seq(slashedOperator, naryandRecursion.as("naryand_recursion").maybe()),
    ),
  );

  const baselessSub = rule(() =>
    ordered(
      seq(
        invisibleSpace,
        baseSyntax,
        opSizeOverridesSymbols.absent(),
        seq(operatorSymbols.maybe(), baselessSubValues("sub_script")),
      ),
      seq(
        invisibleSpace,
        baseSyntax,
        opSizeOverridesSymbols.absent(),
        seq(operatorSymbols, recursiveBaselessSubExp.maybe()),
      ),
      seq(
        invisibleSpace,
        baseSyntax,
        opSizeOverridesSymbols.absent(),
        seq(operatorSymbols, baselessSubValues("sub_script").maybe()),
      ),
      subParen.as("sub_script"),
    ),
  );

  const baselessSup = rule(() =>
    ordered(
      seq(
        invisibleSpace,
        powerSyntax,
        opSizeOverridesSymbols.absent(),
        seq(operatorSymbols.maybe(), baselessSupValues("sup_script")),
      ),
      seq(
        invisibleSpace,
        powerSyntax,
        opSizeOverridesSymbols.absent(),
        seq(operatorSymbols, recursiveBaselessSupExp.maybe()),
      ),
      seq(
        invisibleSpace,
        powerSyntax,
        opSizeOverridesSymbols.absent(),
        seq(operatorSymbols, baselessSupValues("sup_script").maybe()),
      ),
      supParen.as("sup_script"),
    ),
  );

  const recursiveBaselessSupExp = rule(() =>
    ordered(
      seq(miniSubSup, recursiveBaselessSupExp.as("exp_iteration").maybe()),
      seq(baselessSup.as("sup_recursion"), recursiveBaselessSupExp.as("exp_iteration").maybe()),
    ),
  );

  const recursiveBaselessSubExp = rule(() =>
    ordered(
      seq(miniSubSup, recursiveBaselessSubExp.as("exp_iteration").maybe()),
      seq(baselessSub.as("sub_recursion"), recursiveBaselessSubExp.as("exp_iteration").maybe()),
    ),
  );

  const naryandValues = rule(() =>
    ordered(
      seq(binomialFraction.absent(), fraction.as("frac")),
      seq(expBracket, ordered(subsup, subscriptValue, supscriptValue).maybe()),
      seq(expScript, spaceMaybe),
      seq(binomialFraction.as("frac"), spaceMaybe),
      seq(negatableSymbols.absent(), subSupOperand),
    ),
  );

  const miniSubSup = rule(() =>
    seq(
      miniSubSupPresent,
      ordered(
        seq(subSupOperand.as("base"), miniSubsup).as("mini_sub_sup"),
        miniSubValue,
        miniSupValue,
      ),
    ),
  );

  const narySubSup = rule(() =>
    ordered(
      seq(
        powerBaseScript.as("nary_sub_sup"),
        seq(invisibleSpace, spaceMaybe),
        naryandRecursion.as("naryand").maybe(),
      ),
      seq(opNary, seq(invisibleSpace, spaceMaybe), naryandRecursion.as("naryand").maybe()),
    ),
  );

  const unarySubSup = rule(() =>
    ordered(
      seq(
        ordered(powerBaseScript, miniSubSup).as("unary_sub_sup"),
        seq(invisibleSpace, spaceMaybe),
        expression.as("first_value").maybe(),
      ),
      seq(opUnaryFunctions, seq(invisibleSpace, spaceMaybe), expression.as("first_value").maybe()),
    ),
  );

  const baseValue = rule(() =>
    ordered(
      seq(opNary.present(), opNary, invisibleSpace, number.as("mask").maybe()),
      seq(scriptBase.as("base"), invisibleSpace),
    ),
  );

  const subsup = rule(() =>
    ordered(
      seq(
        opSizeOverridesSymbols.absent(),
        baselessSub.as("sub"),
        ordered(supOverride.as("sup"), baselessSup.as("sup")),
      ),
      seq(
        opSizeOverridesSymbols.absent(),
        baselessSup.as("sup"),
        ordered(subOverride.as("sub"), baselessSub.as("sub")),
      ),
      seq(ordered(subOverride.as("sub"), baselessSub.as("sub")), baselessSup.as("sup")),
      seq(ordered(supOverride.as("sup"), baselessSup.as("sup")), baselessSub.as("sub")),
    ),
  );

  const miniSubsup = rule(() =>
    ordered(
      seq(subParen.as("sub"), supParen.as("sup")),
      seq(supParen.as("sup"), subParen.as("sub")),
    ),
  );

  const accentsSubsup = rule(() =>
    ordered(
      seq(baselessSub.as("sub"), baselessSup.as("sup")),
      seq(baselessSup.as("sup"), baselessSub.as("sub")),
      seq(subParen.as("sub"), supParen.as("sup")),
      seq(supParen.as("sup"), subParen.as("sub")),
      baselessSub.as("sub"),
      baselessSup.as("sup"),
      subParen.as("sub"),
      supParen.as("sup"),
    ),
  );

  const miniPowerBase = rule(() =>
    ordered(
      seq(
        supParen.as("pre_supscript"),
        subParen.as("pre_subscript").maybe(),
        miniValues.as("mini_base"),
        subParen.as("mini_sub").maybe(),
        miniValues.as("mini_sup"),
      ),
      seq(
        subParen.as("pre_subscript"),
        supParen.as("pre_supscript").maybe(),
        miniValues.as("mini_base"),
        supParen.as("mini_sup").maybe(),
        miniValues.as("mini_sub"),
      ),
      seq(miniValues.as("mini_base"), subParen.as("mini_sub"), miniValues.as("mini_sup")),
      seq(miniValues.as("mini_base"), supParen.as("mini_sup"), subParen.as("mini_sub")),
      seq(miniValues.as("mini_base"), miniValues.as("mini_sup")),
      seq(miniValues.as("mini_base"), subParen.as("mini_sub")),
    ),
  );

  const miniValues = rule(() =>
    ordered(opSupOperators, opSubOperators, opSupDigits, opSubDigits, opSupAlpha, opSubAlpha),
  );

  const expScript = rule(() =>
    ordered(
      seq(opNary.present(), narySubSup.as("nary")),
      seq(opUnaryFunctions.present(), unarySubSup.as("unary_subsup")),
      seq(accents.present(), seq(accents.as("base"), accentsSubsup).as("accents_subsup")),
      powerBaseScript,
      seq(baseValue, subSupOverride).as("override_subsup"),
      seq(preSubSupOverride.as("pre_override_subsup"), preScriptBase),
      seq(parenWrapRule(preSubsup), spaceMaybe, preScriptBase).as("pre_script"),
      miniSubSup,
      miniPowerBase,
    ),
  );

  const preSubsup = rule(() =>
    ordered(
      seq(preSubscript, preSupscript),
      seq(preSupscript, preSubscript),
      preSubscript,
      preSupscript,
    ),
  );

  const subSupOperand = rule(() =>
    ordered(
      binarySymbols,
      accents,
      seq(opUnaryFunctions, invisibleUnicodeMaybe),
      alphaNumericValues,
      number,
      anMath,
      other,
      expBracket,
      wrapperSymbols,
      parsingText,
      negatableSymbols,
      soperand,
      ordered(str("|"), str("&#x2032;")).as("symbol"),
    ),
  );

  const subAlphaDigits = rule(() =>
    ordered(
      seq(seq(opSubDigits, opSubAlpha).as("expr"), subParen.as("sub_recursion").maybe()),
      seq(seq(opSubAlpha, opSubDigits).as("expr"), subParen.as("sub_recursion").maybe()),
      seq(opSubAlpha, subParen.as("sub_recursion_expr").maybe()),
      seq(opSubDigits, subParen.as("sub_recursion_expr").maybe()),
      seq(opSubOperators, subParen.as("sub_recursions").maybe()),
    ),
  );

  const supAlphaDigits = rule(() =>
    ordered(
      seq(seq(opSupDigits, opSupAlpha).as("expr"), supParen.as("sup_recursion").maybe()),
      seq(seq(opSupAlpha, opSupDigits).as("expr"), supParen.as("sup_recursion").maybe()),
      seq(opSupAlpha, supParen.as("sup_recursion_expr").maybe()),
      seq(opSupDigits, supParen.as("sup_recursion_expr").maybe()),
      seq(opSupOperators, supParen.as("sup_recursions").maybe()),
    ),
  );

  const subParen = rule(() =>
    ordered(
      seq(
        seq(opSubOpenParen, subAlphaDigits.as("mini_expr"), opSubCloseParen).as(
          "mini_intermediate_exp",
        ),
        subParen.maybe(),
      ),
      seq(subAlphaDigits, subParen.maybe()),
    ),
  );

  const supParen = rule(() =>
    ordered(
      seq(
        seq(opSupOpenParen, supAlphaDigits.as("mini_expr"), opSupCloseParen).as(
          "mini_intermediate_exp",
        ),
        supParen.maybe(),
      ),
      seq(supAlphaDigits, supParen.maybe()),
    ),
  );

  const subSupValues = rule(() =>
    ordered(
      seq(
        operatorSymbols.as("expr"),
        seq(seq(ordered(miniSubSup, subOrSup), spaceMaybe), bracketedSoperand.maybe()),
      ),
      seq(operatorSymbols.as("expr"), bracketedSoperand),
      seq(
        seq(
          ordered(primes, prefixedPrimes).as("symbol").as("first_value"),
          repeatedAccentSymbols,
        ).as("accents"),
        seq(subOrSup.maybe(), spaceMaybe, bracketedSoperand).maybe(),
      ),
      seq(
        bracketedSoperand,
        str("&#x2212;").absent(),
        operatorSymbols.absent(),
        subSupValues.as("expr").maybe(),
      ),
      seq(
        subSupBinaryAbsent,
        str("&#x2212;").absent(),
        operatorSymbols.absent(),
        subSupValues.as("expr").maybe(),
      ),
      bracketedSoperand,
      prefixedPrimes,
      primes,
      subSupBinaryAbsent,
    ),
  );

  const alphaNumericValues = rule(() =>
    ordered(
      seq(alphaAscii, alphaNumericValues.as("expr")),
      seq(ordered(number, nAscii), alphaNumericValues.as("expr")),
      alphaAscii,
      ordered(number, nAscii),
    ),
  );

  // === unicode_math/parse.rb ===============================================

  const an = rule(() => ordered(anMath, anOther));
  const box = rule(() => seq(str("□"), operand));

  const char = rule(() => seq(absentChars, unicode.as("unicode_symbols")));
  const rows = rule(() =>
    ordered(
      seq(str("@").as("tr"), spaceMaybe, rows.as("trs").maybe()),
      seq(row.as("tr"), spaceMaybe, str("@"), spaceMaybe, rows.as("trs").maybe()),
      row.as("tr"),
    ),
  );

  const space = rule(() => ordered(match(`[${RUBY_SPACE}]`).repeat(1), invisibleTimes));
  const other = rule(() => seq(otherAbsent, alphanumeric.as("symbol")));

  const spaceMaybe = rule(() => space.maybe());
  const digits = rule(() => ordered(seq(nAscii, digits), nAscii));

  const opNary = rule(() => ordered(opNarySymbols, opNaryText));
  const nAscii = rule(() => match("[0-9]").repeat(1).as("number"));
  const aAscii = rule(() => match("[A-Za-z]").repeat(1).as("symbol"));
  const unicode = rule(() => seq(str("&#x"), match("[0-9a-fA-F]").repeat(), str(";")));
  const anMath = rule(() =>
    seq(space.absent(), match("[\\u{1D400}-\\u{1D7FF}\\u{2102}-\\u{2134}]")),
  );

  const tdValue = rule(() => seq(expression.as("exp"), spaceMaybe, tdValue.as("expr").maybe()));
  const anOther = rule(() =>
    seq(ordered(anMath, nAscii).absent(), alphanumeric.as("alphanumeric")),
  );
  const functionRule = rule(() => ordered(rootFunctions, box, hbrack, argFunction, intentFunction));
  const opArray = rule(() =>
    ordered(opMatrixs, opPrefixedMatrixs, str("&"), str("&#xb;"), str("\\array")),
  );

  const opOpener = rule(() => ordered(openParen, opOpenUnicode, opOpenParen, opOpen));
  const opCloser = rule(() => ordered(opCloseUnicode, closeParen, opCloseParen, opClose));

  const opDecimal = rule(() => ordered(decimalMarkerAtom(), str(","), str(".")));
  const diacritics = rule(() =>
    ordered(seq(char.as("char"), diacritics.as("diacritics")), char.as("char")),
  );

  const openParen = rule(() =>
    ordered(seq(opMaskedOpen, ordered(opCloser, opOpener)).as("open_paren"), opMaskedOpen),
  );

  const matrixOnly = rule(() => seq(nonMatrixsAbsence, ordered(opMatrixs, opPrefixedMatrixs)));
  const closeParen = rule(() =>
    ordered(seq(opMaskedClose, ordered(opOpener, opCloser)).as("close_paren"), opMaskedClose),
  );

  const diacriticbase = rule(() => ordered(an, nAscii));
  const forwardSlash = rule(() => ordered(str("/"), str("&#x2f;"), str("&#x2044;")));

  const rootFunctions = rule(() => ordered(qdrt, cbrt, sqrt, binaryRoot, nthrt));
  const opOverChoose = rule(() => ordered(str("\\choose"), str("&#x249e;")).as("choose"));
  const opMaskedOpen = rule(() =>
    seq(
      ordered(str("\\left"), str("\\open"), str("&#x251c;")).as("paren_open_prefix"),
      digits.as("open_paren_mask").maybe(),
    ),
  );

  const invisibleTimes = rule(() =>
    ordered(str("&#x2062;"), str("&#x2061;"), str("&#x20;"), seq(str("\\itimes"), spaceMaybe)),
  );

  const ordinarySymbols = rule(() => ordered(opOrdinarySymbols, opPrefixedOrdinarySymbols));
  const intervalAascii = rule(() => match("[A-Za-z]").as("symbol").repeat(1));

  const negatableSymbols = rule(() =>
    ordered(seq(forwardSlash, negated), seq(negated, str("&#x338;"))),
  );
  const invisibleUnicode = rule(() =>
    ordered(str("&#x2592;"), ordered(str("\\naryand"), seq(str("\\of"), spaceMaybe))),
  );

  const invisibleUnicodeMaybe = rule(() => invisibleUnicode.maybe());
  const relationalSymbols = rule(() => ordered(opRelationalUnicode, opRelationalSymbols));

  /**
   * `parse.rb:100`. Unreachable: nothing refers to it, and `hbrack` writes this
   * very expression out again rather than calling it.
   */
  const hbrackPowerBaseCheck = rule(() =>
    seq(subSupOperand, ordered(powerSymbol, baseSymbol)).present(),
  );
  /** `parse.rb:103`. Unreachable: the only reference to it is its own recursion. */
  const spacedBracketedOperand = rule(() =>
    seq(operand, spaceMaybe, spacedBracketedOperand.as("expr").maybe()),
  );

  const hbrack = rule(() =>
    ordered(
      seq(opHbrackets, str("(").present(), expBracket.as("first_value")),
      seq(
        opHbrackets,
        seq(subSupOperand, ordered(powerSymbol, baseSymbol)).present(),
        expScript.as("scripted_first_value"),
      ).as("hbrack"),
      seq(opHbrackets, operand.as("first_value")).as("hbrack"),
    ),
  );

  const negated = rule(() =>
    seq(
      rootFunctions.absent(),
      ordered(
        opNegated,
        opPrefixedNegated,
        opPrefixedOrdinaryNegated,
        opOrdinaryNegated,
        binaryNegated,
        seq(absentNegatedUnicodes, unicode.as("negated_operator")),
      ),
    ),
  );

  const opOver = rule(() =>
    ordered(
      str("&#x2044;").as("bevelled"),
      seq(slash, ordered(str("sdiv"), str("sdivide"), str("sfrac")).as("bevelled")),
      str("&#x2298;").as("no_display_style"),
      seq(slash, ordered(str("ndiv"), str("oslash")).as("no_display_style")),
      ordered(str("&#x2215;"), str("\\ldiv")).as("ldiv"),
      forwardSlash,
      str("\\over"),
      str("&#x2f;"),
      str("\\not"),
      ordered(str("&#xa6;"), str("\\atop")).as("atop"),
      opOverChoose,
    ),
  );

  const elementExpScriptValidation = rule(() =>
    seq(
      seq(ordered(opUnaryFunctions, unaryArgFunctions).absent(), atom.as("factor").maybe()),
      seq(miniSubSupPresent, operator, miniFraction.present()).absent(),
    ),
  );

  const spacedExpBracket = rule(() =>
    ordered(
      seq(expression, spaceMaybe, spacedExpBracket.as("exp")),
      seq(midSymbols, spaceMaybe, spacedExpBracket.as("expr")),
      seq(str("&#x2212;").as("symbol"), spaceMaybe, spacedExpBracket.as("expr")),
      seq(expression, spaceMaybe),
    ),
  );

  const row = rule(() =>
    ordered(
      seq(tdValue.as("td"), spaceMaybe, str("&"), spaceMaybe, row.as("tds").maybe()),
      tdValue.as("td"),
      seq(char.absent(), spaceMaybe, str("&").as("td"), spaceMaybe, row.as("tds").maybe()),
    ),
  );

  const array = rule(() =>
    ordered(
      seq(opArray, str("("), rows.as("array"), str(")")).as("table"),
      seq(matrixOnly, match("[0-9]").as("identity_matrix_number")).as("table"),
    ),
  );

  const slashedOperator = rule(() =>
    ordered(
      seq(
        absentSlashedValues,
        str("\\"),
        ordered(str("\\"), unicode, ordered(nAscii, aAscii).repeat(1), any()).as("slashed_value"),
      ),
      seq(absentSlashedValues, str("\\").as("slashed_value")),
    ),
  );

  const number = rule(() =>
    ordered(
      hexNumber,
      binaryNumber,
      octalNumber,
      seq(digits.as("whole"), opDecimal.as("decimal"), digits.as("fractional")).as(
        "decimal_number",
      ),
      seq(opDecimal.as("decimal"), digits.as("whole"), spaceMaybe).as("decimal_number"),
      digits.as("digit"),
    ),
  );

  const numerator = rule(() =>
    seq(
      ordered(relationalSymbols.absent(), expScript.present()),
      ordered(
        seq(unaryArgFunctions, numerator.as("recursive_numerator").maybe()),
        seq(
          seq(
            seq(absentNumeratorExpScript, opNary.absent()),
            miniFractionExpScriptAbsent,
            expScript,
            space,
          ),
          numerator.as("recursive_numerator").maybe(),
        ),
        seq(
          seq(absentNumeratorExpScript, miniFractionExpScriptAbsent, expScript),
          numerator.as("recursive_numerator").maybe(),
        ),
        seq(accents.as("base"), accentsSubsup).as("accents_subsup"),
        subParen,
        supParen,
        accents,
        unaryArgFunctions,
        seq(fracBinaryAbsent, numerator.as("recursive_numerator")),
        seq(factor, fracBinaryAbsent.maybe(), numerator.as("recursive_numerator").maybe()),
        seq(operator.absent(), operand, fracBinaryAbsent.maybe()),
        fracBinaryAbsent,
      ),
    ),
  );

  const opBuildUp = rule(() =>
    ordered(
      str("_"),
      str("^"),
      str("∛"),
      str("∜"),
      str("□"),
      str("|"),
      opArray,
      opOpen,
      opClose,
      opNary,
      opOver,
      forwardSlash,
      opHbrackets,
      rootSymbols,
      opDecimal,
    ),
  );

  const expBracket = rule(() =>
    ordered(
      seq(
        str("||").as("open_paren"),
        spaceMaybe,
        spacedExpBracket,
        spaceMaybe,
        str("||").as("close_paren"),
      ),
      seq(
        str("|").as("open_paren"),
        spaceMaybe,
        spacedExpBracket,
        spaceMaybe,
        str("|").as("close_paren"),
      ),
      intervalExpBracket,
      seq(opOpener, spaceMaybe, spacedExpBracket.maybe(), spaceMaybe, opCloser),
      seq(mixBracketed.as("intermediate_exp"), spaceMaybe, expression.as("expr")),
      seq(mixBracketed.as("intermediate_exp"), space),
    ),
  );

  const intervalExpBracket = rule(() =>
    ordered(
      seq(
        str("(").as("open_paren"),
        intervalValue.as("left_value"),
        str(",").as("comma"),
        intervalValue.as("right_value"),
        str("]").as("close_paren"),
      ),
      seq(
        str("[").as("open_paren"),
        intervalValue.as("left_value"),
        str(",").as("comma"),
        intervalValue.as("right_value"),
        str(")").as("close_paren"),
      ),
      seq(
        ordered(str("["), str("]")).as("open_paren"),
        intervalValue.as("left_value"),
        str(",").as("comma"),
        intervalValue.as("right_value"),
        ordered(str("["), str("]")).as("close_paren"),
      ),
    ),
  );

  const intervalValue = rule(() =>
    ordered(
      infty.as("infty"),
      seq(str("+").as("positive"), ordered(infty.as("infty"), digits, intervalAascii)),
      seq(
        ordered(str("-"), str("&#x2212;")).as("negative"),
        ordered(infty.as("infty"), digits, intervalAascii),
      ),
      digits,
      intervalAascii,
    ),
  );

  const mixBracketed = rule(() =>
    ordered(
      seq(opOpener, spaceMaybe, spacedExpBracket, spaceMaybe, str("|").as("close_paren")),
      seq(str("|").as("open_paren"), spaceMaybe, spacedExpBracket, spaceMaybe, opCloser),
    ),
  );

  const denominator = rule(() =>
    ordered(
      seq(operator.absent(), fraction.as("frac")),
      expScript,
      subParen,
      supParen,
      seq(
        fracBinaryAbsent,
        invisibleTimes.maybe(),
        relationalSymbols.absent(),
        denominator.as("recursive_denominator"),
      ),
      seq(
        operator.absent(),
        factor,
        invisibleTimes.maybe(),
        relationalSymbols.absent(),
        denominator.as("recursive_denominator"),
      ),
      seq(
        operator.absent(),
        operand,
        invisibleTimes.maybe(),
        relationalSymbols.absent(),
        denominator.as("recursive_denominator"),
      ),
      fracBinaryAbsent,
      seq(operator.absent(), operand),
    ),
  );

  const opMaskedClose = rule(() =>
    seq(
      ordered(str("\\right"), str("\\close"), str("&#x2524;")).as("paren_close_prefix"),
      digits.as("close_paren_mask").maybe(),
    ),
  );

  const element = rule(() =>
    ordered(
      seq(accents.present(), seq(accents.as("base"), accentsSubsup).as("accents_subsup")),
      seq(accents.present(), fraction.as("frac")),
      seq(ordered(opUnaryFunctions, unaryArgFunctions).present(), fraction.as("frac")),
      seq(miniSubSupPresent, operator, miniFraction.as("frac")),
      accents,
      diacriticsAccents,
      opUnicodeFractions,
      fraction.as("frac"),
      monospaceFonts,
      array,
      expScript,
      seq(elementExpScriptValidation, spaceMaybe, expScript),
      unaryArgFunctions,
      combinedSymbols,
      wrapperSymbols,
      operand,
      char,
      alphanumeric,
      negatableSymbols,
      operator,
      binarySymbols,
      slashedOperator,
    ),
  );

  const expression = rule(() =>
    ordered(
      seq(element, other.as("other"), expression.as("expr")),
      seq(element, relationalSymbols, expression.as("expr").maybe()),
      element,
      seq(element, spaceMaybe, expression.as("expr")),
      seq(slashedOperator, spaceMaybe, expression.as("expr").maybe()),
      seq(
        element,
        spaceMaybe,
        expression.as("expr"),
        spaceMaybe,
        expression.as("expression").maybe(),
      ),
      seq(miniValues, spaceMaybe, expression.as("expr").maybe()),
    ),
  );

  // === base_number_prefix.rb ===============================================

  const hexNumber = rule(() =>
    seq(ordered(str("0x"), str("0X")), match("[0-9a-fA-F]").repeat(1).as("hex_number")),
  );
  const binaryNumber = rule(() =>
    seq(ordered(str("0b"), str("0B")), match("[01]").repeat(1).as("binary_number")),
  );
  const octalNumber = rule(() =>
    seq(ordered(str("0o"), str("0O")), match("[0-7]").repeat(1).as("octal_number")),
  );

  const rules: UnicodemathRules = {
    slash,
    slashMaybe,
    primes,
    opOpen,
    opFonts,
    opClose,
    opSpaces,
    opAccent,
    opMatrixs,
    opNegated,
    skipSymbols,
    opSubAlpha,
    opSupAlpha,
    opNaryText,
    opHbracket,
    opOpenParen,
    opSupDigits,
    opSubDigits,
    binarySymbols,
    opCloseParen,
    binaryNegated,
    unicodedFonts,
    wrapperSymbols,
    opNarySymbols,
    opOpenUnicode,
    prefixedPrimes,
    combinedSymbols,
    opCloseUnicode,
    opUnarySymbols,
    opSubOperators,
    opSupOperators,
    opBinarySymbols,
    opSubOpenParen,
    opSupOpenParen,
    opBinaryNegated,
    opUnaryFunctions,
    opAccentPrefixed,
    opSubCloseParen,
    opSupCloseParen,
    opPrefixedMatrixs,
    opDiacriticBelows,
    opCombinedSymbols,
    opOrdinarySymbols,
    opCombinedUnicode,
    opOrdinaryNegated,
    opPrefixedNegated,
    opUnicodeFractions,
    skipSymbolsPrefixed,
    opDiacriticOverlays,
    opRelationalUnicode,
    opAlphanumericFonts,
    opHbracketPrefixed,
    opRelationalSymbols,
    opUnaryArgFunctions,
    opPrefixedUnarySymbols,
    opSizeOverridesSymbols,
    opBinarySymbolsPrefixed,
    opPrefixedBinaryNegated,
    opPrefixedOrdinarySymbols,
    opPrefixedOrdinaryNegated,
    opPrefixedUnaryArgFunctions,
    atom,
    atoms,
    entity,
    operator,
    opUnary,
    midSymbols,
    unarySpaces,
    customFonts,
    parsingText,
    alphanumeric,
    opHbrackets,
    naryFunctions,
    exclamationSymbols,
    exclamationSymbolsMaybe,
    miniFraction,
    binomialFraction,
    fraction,
    fonts,
    unaryArgFunctions,
    accents,
    diacriticsAccents,
    repeatedAccentSymbols,
    primeSymbols,
    operand,
    factor,
    soperand,
    bracketedSoperand,
    infty,
    fracBinaryAbsent,
    nonMatrixsAbsence,
    subSupBinaryAbsent,
    absentNegatedUnicodes,
    fracBinaryAbsentSymbols,
    binaryNegatedAbsentSymbols,
    miniFractionExpScriptAbsent,
    absentChars,
    absentSlashedValues,
    otherAbsent,
    absentNumeratorExpScript,
    rect,
    sqrt,
    qdrt,
    cbrt,
    color,
    phant,
    backcolor,
    cbrtSymbols,
    qdrtSymbols,
    rectSymbols,
    sqrtSymbols,
    rootSymbols,
    argFunction,
    colorSymbols,
    phantomSymbols,
    monospaceFonts,
    backcolorSymbols,
    maskedRecursiveValue,
    rootInvisibleCharacter,
    nthrt,
    binaryRoot,
    intentFunction,
    above,
    below,
    subscript,
    supscript,
    subOrSup,
    baseSymbol,
    baseSyntax,
    alphaAscii,
    scriptBase,
    powerSymbol,
    powerSyntax,
    subOverride,
    supOverride,
    subSupParen,
    preSubscript,
    preSupscript,
    miniSubValue,
    miniSupValue,
    preScriptBase,
    subSupOverride,
    operatorSymbols,
    invisibleSpace,
    prescriptValues,
    powerBaseScript,
    miniSubSupPresent,
    subscriptValue,
    supscriptValue,
    preSubSupOverride,
    naryandRecursion,
    baselessSub,
    baselessSup,
    recursiveBaselessSupExp,
    recursiveBaselessSubExp,
    naryandValues,
    miniSubSup,
    narySubSup,
    unarySubSup,
    baseValue,
    subsup,
    miniSubsup,
    accentsSubsup,
    miniPowerBase,
    miniValues,
    expScript,
    preSubsup,
    subSupOperand,
    subAlphaDigits,
    supAlphaDigits,
    subParen,
    supParen,
    subSupValues,
    alphaNumericValues,
    an,
    box,
    char,
    rows,
    space,
    other,
    spaceMaybe,
    digits,
    opNary,
    nAscii,
    aAscii,
    unicode,
    anMath,
    tdValue,
    anOther,
    functionRule,
    opArray,
    opOpener,
    opCloser,
    opDecimal,
    diacritics,
    openParen,
    matrixOnly,
    closeParen,
    diacriticbase,
    forwardSlash,
    rootFunctions,
    opOverChoose,
    opMaskedOpen,
    invisibleTimes,
    ordinarySymbols,
    intervalAascii,
    negatableSymbols,
    invisibleUnicode,
    invisibleUnicodeMaybe,
    relationalSymbols,
    hbrackPowerBaseCheck,
    spacedBracketedOperand,
    hbrack,
    negated,
    opOver,
    elementExpScriptValidation,
    spacedExpBracket,
    row,
    array,
    slashedOperator,
    number,
    numerator,
    opBuildUp,
    expBracket,
    intervalExpBracket,
    intervalValue,
    mixBracketed,
    denominator,
    opMaskedClose,
    element,
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
 * Building it is not cheap — `wrapperSymbols` alone is 1,492 alternatives — and
 * it is immutable once built, so the parse-time state that would make sharing
 * unsafe (the packrat cache) lives in the per-parse context rather than on the
 * atoms. The cache is keyed by marker, never by locale: two locales that share
 * a marker share a grammar.
 */
const grammarCache = new Map<string, UnicodemathGrammar>();

/** The grammar for a caller's locale, resolved through `formatting`. */
export function unicodemathGrammar(options?: LocaleOptions | null): UnicodemathGrammar {
  const marker = resolveDecimalMarker(options);
  let grammar = grammarCache.get(marker);
  if (grammar === undefined) {
    grammar = createUnicodemathGrammar(marker);
    grammarCache.set(marker, grammar);
  }
  return grammar;
}

/**
 * Parses **preprocessed** UnicodeMath into a Parslet-shaped tree.
 *
 * Throws `ParseFailed`, whose `index` is a UTF-16 offset into the supplied
 * string — which is the *preprocessed* text, not a caller's input, until the
 * preprocessing slice lands to map it back (ARCHITECTURE.md §5).
 *
 * The gem lets `Parslet::ParseFailed` escape `UnicodeMath::Parser#parse`
 * uncaught — there is no `rescue` anywhere under `lib/plurimath/unicode_math/`
 * — so a refusal here is a throw, not a null.
 */
export function parseUnicodemathPreprocessed(preprocessed: string, options?: LocaleOptions | null) {
  return unicodemathGrammar(options).root.parse(preprocessed);
}
