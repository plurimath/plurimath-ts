/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-corpus.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 * What it was generated from is in `src/generated/provenance.ts`.
 *
 * AsciiMath render tables: the three gem tables `to_asciimath` reads
 * that the parse tables cannot supply, consumed by
 * `src/formats/asciimath/renderer.ts`.
 *
 * Every entry is measured off the runtime — a live render per entry,
 * never a source read (PORTING-STANDARDS.md), each re-verified by the
 * generator with a render that actually uses it. The parse direction
 * is no substitute for the first table: `bb`, `mathbf` and `textbf`
 * all parse to `Bold`, and only rendering says which keyword comes
 * back out.
 */

/**
 * FontStyle subclass basename -> the keyword its `to_asciimath`
 * override wraps its value in, measured per class (`Bold.new(x)` ->
 * `mathbf(x)`), sorted by basename. A subclass absent here was
 * measured rendering its value alone, exactly like the bare carrier.
 */
export const ASCIIMATH_FONT_STYLE_KEYWORDS: ReadonlyMap<string, string> = new Map([
  ["Bold", "mathbf"],
  ["DoubleStruck", "mathbb"],
  ["Fraktur", "mathfrak"],
  ["Italic", "ii"],
  ["Monospace", "mathtt"],
  ["Normal", "rm"],
  ["SansSerif", "mathsf"],
  ["Script", "mathcal"],
]);

/**
 * `Asciimath::Constants::TABLE_PARENTHESIS`, keyed by the rendered
 * open paren: the close paren a table with a nil `close_paren`
 * falls back to (`math/function/table.rb:43-49`), in the gem's
 * order. A miss interpolates the empty string (verified).
 */
export const ASCIIMATH_TABLE_CLOSE_FALLBACK: ReadonlyMap<string, string> = new Map([
  ["ᑕ", "ᑐ"],
  ["ℒ", "ℛ"],
  ["[", "]"],
  ["(", ")"],
]);

/**
 * `Table::SIMPLE_TABLES` (`math/function/table.rb:20`): the
 * lowercased class basenames rendered parentheless, `{:...:}`,
 * whatever their parens, in the gem's order. Membership only — the
 * render path asks `include?` — so the order is not semantic.
 */
export const ASCIIMATH_SIMPLE_TABLE_NAMES: readonly string[] = ["array", "align", "split"];
