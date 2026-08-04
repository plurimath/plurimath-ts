/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-corpus.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 * What it was generated from is in `src/generated/provenance.ts`.
 *
 * AsciiMath grammar tables: the alternatives `Asciimath::Parse` builds its
 * rules from, consumed by `src/formats/asciimath/grammar.ts`.
 *
 * Order is behaviour. Parslet's `|` is an ordered choice and
 * `power_base_rules` reduces the three class lists into one of them
 * (`asciimath/parse.rb:82-84`), so these arrays keep the gem's insertion
 * order — they are never sorted, even where today's entries could not
 * overlap.
 */

/**
 * `ternary_classes`: a function taking a base, a power and an
 * optional third value.
 */
export const ASCIIMATH_TERNARY_CLASSES: readonly string[] = ["prod", "oint", "sum", "int"];

/**
 * `binary_classes`: a function taking a base value and a power value.
 */
export const ASCIIMATH_BINARY_CLASSES: readonly string[] = [
  "underset",
  "stackrel",
  "overset",
  "frac",
  "root",
];

/**
 * `sub_sup_classes`: tagged `:binary_class` like the list above, but
 * tried first and followed by a single `power_base`.
 */
export const ASCIIMATH_SUB_SUP_CLASSES: readonly string[] = ["lim", "log"];

/**
 * An opening paren and the closing one that matches it. The two are
 * kept paired because the grammar resolves one from the other at
 * parse time (`read_text`, `asciimath/parse.rb:181`).
 */
export type AsciimathParenPair = readonly [open: string, close: string];

/**
 * `open_table` matches the opening parens, `close_table` the closing
 * ones. `ᑕ ᑐ ℒ ℛ` are the preprocessing substitutions for `(: :) {: :}`.
 */
export const ASCIIMATH_TABLE_PARENTHESIS: readonly AsciimathParenPair[] = [
  ["ᑕ", "ᑐ"],
  ["ℒ", "ℛ"],
  ["[", "]"],
  ["(", ")"],
];

/**
 * `lparen` matches the opening parens and `rparen` the closing ones;
 * `read_text` reads the closing one back from the captured opening one.
 */
export const ASCIIMATH_PARENTHESIS: readonly AsciimathParenPair[] = [
  ["ᑕ", "ᑐ"],
  ["ℒ", "ℛ"],
  ["(", ")"],
  ["{", "}"],
  ["[", "]"],
];
