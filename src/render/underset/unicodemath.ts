/**
 * Mirrors `function/underset.rb` — `Underset#to_unicodemath` (:80).
 *
 * **Not a mirror of `Overset`.** Two differences, both measured:
 *
 *   - the branch order is brackets, then brace-classes, then accent — where
 *     `Overset` tests accents first and brackets third;
 *   - `match_unicode?` reads `DIACRITIC_BELOWS` (`underset.rb:142`) where
 *     `Overset` reads `DIACRITIC_OVERLAYS`.
 *
 * It also has only ONE accent branch, reading `parameter_one`, so it never
 * needs `Overset`'s unguarded `unicodemath_field_value(parameter_one)`.
 *
 * The final branch has no nil guard in the gem: `parameter_one.to_unicodemath`
 * raises when it is nil, which the port surfaces as a typed `RenderError`
 * through the shared child renderer rather than as a crash. Measured:
 * `Underset.new(nil, Symbol("x"))` raises `NoMethodError: undefined method
 * 'to_unicodemath' for nil`, and `renderOptionalChild` — which returns `""` for
 * nil — used to render it as `"(x)┬"`.
 */

import {
  className,
  fieldGlyph,
  htmlEntityToUnicode,
  isNode,
  type NodeOf,
  type RenderContext,
  renderChild,
  renderOptionalChild,
  unicodemathParens,
} from "../../formats/unicodemath/render-shared";
import {
  UNICODEMATH_ACCENT_SYMBOLS,
  UNICODEMATH_DIACRITIC_BELOWS,
  UNICODEMATH_HORIZONTAL_BRACKETS,
} from "../../generated/unicodemath/render-tables";

/** One of the gem's entity-valued constants, indexed the two ways it is read. */
interface EntityTable {
  /** The entries verbatim — what a generic symbol's raw `value` is compared against. */
  readonly raw: ReadonlySet<string>;
  /**
   * Decoded glyph -> the entry it decodes from.
   *
   * A `Map` can only carry one entry per glyph, which is sound here and
   * measured: across `DIACRITIC_BELOWS + ACCENT_SYMBOLS.values` (73 entries, 69
   * distinct) no two DISTINCT entity strings decode to the same character, and
   * the same holds for `DIACRITIC_OVERLAYS + ACCENT_SYMBOLS.values` (44/41) and
   * for `HORIZONTAL_BRACKETS` (8/8). The duplicates are repeats of one string
   * (`widetilde` and `tilde` are both `"&#x303;"`), so the surviving entry is
   * the same string either way.
   */
  readonly byGlyph: ReadonlyMap<string, string>;
}

function entityTable(entities: Iterable<string>): EntityTable {
  const raw = new Set(entities);
  return {
    raw,
    byGlyph: new Map([...raw].map((entity) => [htmlEntityToUnicode(entity), entity] as const)),
  };
}

/**
 * `Underset#match_unicode?` (`underset.rb:142`) — BELOWS, not OVERLAYS.
 *
 * The gem asks `DIACRITIC_BELOWS.include?` then `ACCENT_SYMBOLS.has_value?`;
 * both are membership in entity text, so one set answers both. Which of the two
 * hit cannot reach the output: the branch emits the field value itself, never
 * the table entry it matched.
 */
const ACCENTS = entityTable([
  ...UNICODEMATH_DIACRITIC_BELOWS,
  ...UNICODEMATH_ACCENT_SYMBOLS.values(),
]);

/** `HORIZONTAL_BRACKETS.value?(...)` (`underset.rb:132`). */
const HORIZONTAL_BRACKETS = entityTable(UNICODEMATH_HORIZONTAL_BRACKETS.values());

/**
 * `Core#unicodemath_field_value(field)` (`core.rb:484`) tested for membership in
 * `table`, returning the matched entry — which IS the gem's field value, since
 * the gem's own test is string equality against exactly these entries.
 *
 * The field value is **not** the render. The gem's expression is
 * `field.class_name == "symbol" ? field.value : Utility.hexcode_in_input(field)`,
 * and `hexcode_in_input` returns the first `/&#x.+;/` entry of the class's
 * parse-INPUT table — raw entity text. Reading the render instead diverges twice
 * over, and both were live here:
 *
 *   - the accent branch EMITS this value, so the gem writes `"(x)&#x331;"` for
 *     `Underset(Underbar, Symbol("x"))` where reading the render wrote
 *     `"(x)̱"`. Identical after `Formula#to_unicodemath`'s entity decode, which
 *     this port runs in `formulaBoundary` — and different when an `Underset` is
 *     the render root, which `toUnicodemath` allows and the gem's own bare
 *     `Underset#to_unicodemath` measures;
 *   - for `Math::Symbols::Symbol` itself the value is `value` RAW, so
 *     `Symbol("&#x316;", slashed: true)` — whose render is `"\\&#x316;"` — is
 *     still an accent to the gem, and `Symbol("̖")`, holding the decoded
 *     character, is NOT one. Measured: `"(x)&#x316;"` and `"(x)┬̖"`.
 *
 * The `class_name == "symbol"` half is exact here: `className` is the gem's own
 * expression, and no census class shares a basename (measured across all 1,460
 * — no duplicates, and none named `Symbol`).
 *
 * The `hexcode_in_input` half is a PROXY — the port has no generated table of
 * parse-INPUT entities, so it decodes the render and looks that up. Measured
 * against the gem's own predicate over all 1,460 symbol classes: 2
 * disagreements for this table and for `DIACRITIC_OVERLAYS`, 0 for
 * `HORIZONTAL_BRACKETS`. Both are classes whose render is an ASCII shorthand
 * rather than the entity they parse from — `Hat` renders `"^"` against
 * `"&#x302;"`, `Tilde` renders `"~"` against `"&#x303;"` — so the gem accents
 * them and this does not: `Underset(Hat, Symbol("x"))` is `"(x)&#x302;"` there
 * and `"(x)┬^"` here. Closing it needs the generated table, not a hand-typed
 * pair (PORTING-STANDARDS.md, "Generated data discipline"); the six classes
 * whose render is not their field value decoded are `Dots`, `Hat`,
 * `Paren::Langle`, `Paren::Rangle`, `Slash` and `Tilde`.
 */
function matchedFieldValue(
  field: unknown,
  context: RenderContext,
  table: EntityTable,
): string | null {
  // `return false unless field.is_a?(Math::Symbols::Symbol)` — the guard both
  // `unicode_accent?` (:126) and `horizontal_brackets?` (:132) open with, and
  // the reason a `Formula` or a nil slot answers false instead of raising.
  if (!isNode(field) || field.kind !== "symbol") return null;

  if (className(field.id) === "symbol") {
    const value = field.value;
    return value !== null && table.raw.has(value) ? value : null;
  }

  const glyph = fieldGlyph(field, context);
  return glyph === null ? null : (table.byGlyph.get(glyph) ?? null);
}

/** `unicode_classes_accent?` (`underset.rb:138`). */
function isBraceClass(field: unknown): boolean {
  return isNode(field) && (field.kind === "obrace" || field.kind === "ubrace");
}

export function renderUnderset(node: NodeOf<"underset">, context: RenderContext): string {
  const one = node.parameterOne;
  const two = node.parameterTwo;

  // `horizontal_brackets?` asks `parameter_one` regardless of its argument.
  if (matchedFieldValue(one, context, HORIZONTAL_BRACKETS) !== null) {
    return `${renderOptionalChild(one, context)}${unicodemathParens(two, context) ?? ""}`;
  }
  if (isBraceClass(two)) {
    return `${renderOptionalChild(two, context)}_${unicodemathParens(one, context) ?? ""}`;
  }
  const oneAccent = matchedFieldValue(one, context, ACCENTS);
  if (oneAccent !== null) {
    return `${unicodemathParens(two, context) ?? ""}${oneAccent}`;
  }

  // U+252C BOX DRAWINGS LIGHT DOWN AND HORIZONTAL. `unicodemath_parens` is the
  // first interpolation and raises for a nil `parameter_two`; `renderChild`
  // then refuses a nil `parameter_one`, which the gem sends `to_unicodemath`
  // unguarded.
  return `${unicodemathParens(two, context) ?? ""}┬${renderChild(one, context, "underset.parameterOne") ?? ""}`;
}
