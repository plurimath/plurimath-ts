/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-html-parser-data.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 * What it was generated from is in `src/formats/html/generated/provenance.ts`.
 *
 * The constant tables `Plurimath::Html::Parse` builds its rules from.
 *
 * Order is behaviour. `array_to_expression` (`html/parse.rb:133`) folds each
 * table into a Parslet ordered choice, and Parslet's `|` has no longest-match
 * backtracking — so these arrays keep the gem's own order and are never
 * sorted here. Every entry was parsed back through the gem's own rule, and
 * its tag checked, before emission.
 *
 * **Arrays, never Maps — and here that is a guard rather than a necessity.**
 * Neither collision the two earlier formats hit applies to these four tables:
 * no `Html::Constants` hash mixes Symbol and String keys as LaTeX's
 * `symbols_constants` does, and no table below repeats a text as nine of
 * UnicodeMath's `.values` tables do. Both are re-checked on every run. What
 * does repeat is one projection the grammar never reads — see
 * `HTML_REPEATED_TEXT_PROJECTIONS`.
 */

/**
 * `Constants::UNARY_CLASSES` -> `unary` (`html/parse.rb:9`),
 * an ordered choice of `str(text).as(:unary)`.
 *
 * 25 entries, all distinct.
 * 6 of them are prefix pairs written longest-first
 * (coth before cot, tanh before tan, ...), so the order is behaviour.
 */
export const HTML_UNARY_CLASSES: readonly string[] = [
  "arcsin",
  "arccos",
  "arctan",
  "coth",
  "tanh",
  "sech",
  "csch",
  "sqrt",
  "ceil",
  "sinh",
  "cosh",
  "sin",
  "cos",
  "gcd",
  "csc",
  "abs",
  "vec",
  "exp",
  "sec",
  "tan",
  "cot",
  "lcm",
  "det",
  "ln",
  "lg",
];

/**
 * `Constants::PARENTHESIS.keys` -> `lparen` (`html/parse.rb:21`),
 * an ordered choice of `str(text).as(:lparen)`.
 *
 * 3 entries, all distinct.
 */
export const HTML_LPAREN: readonly string[] = ["(", "{", "["];

/**
 * `Constants::PARENTHESIS.values` -> `rparen` (`html/parse.rb:25`),
 * an ordered choice of `str(text).as(:rparen)`.
 *
 * 3 entries, all distinct.
 */
export const HTML_RPAREN: readonly string[] = [")", "}", "]"];

/**
 * `Constants::SUB_SUP_CLASSES.keys` -> `sub_sup` (`html/parse.rb:29`),
 * an ordered choice of `str(text).as(:sum_prod)`.
 *
 * 8 entries, all distinct.
 */
export const HTML_SUB_SUP_CLASSES: readonly string[] = [
  "&prod;",
  "&sum;",
  "&#x220f;",
  "&#x2211;",
  "log",
  "lim",
  "∏",
  "∑",
];

/**
 * Projections of `Html::Constants` the grammar does NOT read, as
 * [projection, entries, distinct, unreachable repeats, who reads it].
 *
 * Emitted so the array-not-Map decision above carries its own evidence.
 * The UnicodeMath tables are ordered arrays because keying them by text
 * would have deleted 28 alternatives; the HTML tables cannot collapse
 * that way, but the shape that would is one projection away, and this
 * row measures it. `test/formats/html/parser-tables.spec.ts` asserts that
 * no emitted table name appears here.
 */
export const HTML_REPEATED_TEXT_PROJECTIONS: ReadonlyArray<
  readonly [projection: string, entries: number, distinct: number, repeats: number, readBy: string]
> = [
  [
    "SUB_SUP_CLASSES.values",
    8,
    4,
    4,
    "html/utility.rb:12 (`Utility.sub_sup_method?`), transform side",
  ],
];

/**
 * Every decimal marker the gem's locale table yields, which
 * `decimal_marker` (`html/parse.rb:147`) matches **raw**.
 *
 * There is no encoded form to look up, which is what makes this an
 * array where LaTeX and UnicodeMath both emit a Map. Their parsers
 * entity-encode the whole input before Parslet sees it, so their
 * grammars match `&#x66b;` where the user typed U+066B.
 * `Html::Parser` (`html/parser.rb:28`) encodes only substrings that
 * already look like entities — it has to, or `<` would become
 * `&#x3c;` and no tag would survive — so a bare marker reaches the
 * grammar unchanged. Proved per marker on every run, together with
 * the exclusivity LaTeX shares and UnicodeMath does not: under one
 * locale's marker the others are not decimal points.
 */
export const HTML_RAW_DECIMAL_MARKERS: readonly string[] = [",", ".", "٫"];
