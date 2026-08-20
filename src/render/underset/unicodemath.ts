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
  isNode,
  type NodeOf,
  type RenderContext,
  renderChild,
  renderOptionalChild,
  unicodemathFieldValue,
  unicodemathParens,
} from "../../formats/unicodemath/render-shared";
import {
  UNICODEMATH_ACCENT_SYMBOLS,
  UNICODEMATH_DIACRITIC_BELOWS,
  UNICODEMATH_HORIZONTAL_BRACKETS,
} from "../../generated/unicodemath/render-tables";

/**
 * One of the gem's entity-valued constants.
 *
 * `match_unicode?` is `include?` / `has_value?` against entity text, and what
 * this port hands it is entity text too, so a plain set of the entries verbatim
 * is the whole structure. An earlier version also indexed each table by decoded
 * glyph, because the value being tested was a decoded render rather than the
 * gem's `unicodemath_field_value`; that index went with the proxy.
 */
type EntityTable = ReadonlySet<string>;

function entityTable(entities: Iterable<string>): EntityTable {
  return new Set(entities);
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
 * Both halves are now exact. `className` is the gem's own expression and no
 * census class shares a basename (measured across all 1,460 — no duplicates,
 * and none named `Symbol`), and the `hexcode_in_input` half reads the generated
 * parse-INPUT table rather than decoding the render.
 *
 * It used to decode the render, which cost 2 disagreements against the gem's
 * own predicate on this table and on `DIACRITIC_OVERLAYS` (0 on
 * `HORIZONTAL_BRACKETS`): `Hat` renders `"^"` against `"&#x302;"` and `Tilde`
 * renders `"~"` against `"&#x303;"`, so the gem accented them and this did not
 * — `Underset(Hat, Symbol("x"))` was `"(x)&#x302;"` there and `"(x)┬^"` here.
 * Measured after the change, across all 1,460 classes through `Formula`: 0.
 */
function matchedFieldValue(field: unknown, table: EntityTable): string | null {
  // `return false unless field.is_a?(Math::Symbols::Symbol)` — the guard both
  // `unicode_accent?` (:126) and `horizontal_brackets?` (:132) open with, and
  // the reason a `Formula` or a nil slot answers false instead of raising.
  if (!isNode(field) || field.kind !== "symbol") return null;

  // `match_unicode?(unicodemath_field_value(field))`. nil never matches: both
  // arms are `include?`/`has_value?` over entity strings, so a nil field value
  // answers false here rather than raising — unlike `prime_unicode?`.
  const value = unicodemathFieldValue(field);
  return value !== null && table.has(value) ? value : null;
}

/** `unicode_classes_accent?` (`underset.rb:138`). */
function isBraceClass(field: unknown): boolean {
  return isNode(field) && (field.kind === "obrace" || field.kind === "ubrace");
}

export function renderUnderset(node: NodeOf<"underset">, context: RenderContext): string {
  const one = node.parameterOne;
  const two = node.parameterTwo;

  // `horizontal_brackets?` asks `parameter_one` regardless of its argument.
  if (matchedFieldValue(one, HORIZONTAL_BRACKETS) !== null) {
    return `${renderOptionalChild(one, context)}${unicodemathParens(two, context) ?? ""}`;
  }
  if (isBraceClass(two)) {
    return `${renderOptionalChild(two, context)}_${unicodemathParens(one, context) ?? ""}`;
  }
  const oneAccent = matchedFieldValue(one, ACCENTS);
  if (oneAccent !== null) {
    return `${unicodemathParens(two, context) ?? ""}${oneAccent}`;
  }

  // U+252C BOX DRAWINGS LIGHT DOWN AND HORIZONTAL. `unicodemath_parens` is the
  // first interpolation and raises for a nil `parameter_two`; `renderChild`
  // then refuses a nil `parameter_one`, which the gem sends `to_unicodemath`
  // unguarded.
  return `${unicodemathParens(two, context) ?? ""}┬${renderChild(one, context, "underset.parameterOne") ?? ""}`;
}
