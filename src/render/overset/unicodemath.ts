/**
 * Mirrors `function/overset.rb` — `Overset#to_unicodemath` (:61).
 *
 * Four child-interrogating branches, in this order:
 *
 *   1. `parameter_one` is an accent → the accent follows the wrapped body;
 *   2. `parameter_two` is an accent → the accent PRECEDES the raw body;
 *   3. horizontal brackets → body then wrapped script;
 *   4. `parameter_two` is an Obrace/Ubrace → script with `^`.
 *
 * `Underset` looks like a mirror of this and is not: its branch order is
 * different, and its accent test reads `DIACRITIC_BELOWS` where this reads
 * `DIACRITIC_OVERLAYS`. Writing one from the other is how they end up wrong.
 *
 * Returns **nil** when both parameters are absent.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import {
  fieldGlyph,
  glyphIn,
  isNode,
  present,
  renderOptionalChild,
  unicodemathParens,
} from "../../formats/unicodemath/render-shared";
import {
  UNICODEMATH_ACCENT_SYMBOLS,
  UNICODEMATH_DIACRITIC_OVERLAYS,
  UNICODEMATH_HORIZONTAL_BRACKETS,
} from "../../generated/unicodemath/render-tables";

/** `Overset#match_unicode?` (`overset.rb:129`) — OVERLAYS, not BELOWS. */
function isAccent(field: unknown, context: RenderContext): boolean {
  const glyph = fieldGlyph(field, context);
  return (
    glyphIn(glyph, UNICODEMATH_DIACRITIC_OVERLAYS) ||
    glyphIn(glyph, UNICODEMATH_ACCENT_SYMBOLS.values())
  );
}

/** `unicode_classes_accent?` (`overset.rb:118`). */
/**
 * Byte-identical to its twin in `../underset/unicodemath.ts`, on purpose.
 *
 * The gem duplicates it too: `horizontal_brackets?` is defined separately and
 * identically on `overset.rb` and `underset.rb`, and this port is one file per
 * gem class (ARCHITECTURE.md §5). Hoisting the pair into `render-shared.ts`
 * would read as a tidy-up and would make the port's structure diverge from the
 * oracle it mirrors, so the duplication stays.
 */
function isBraceClass(field: unknown): boolean {
  return isNode(field) && (field.kind === "obrace" || field.kind === "ubrace");
}

/** `horizontal_brackets?` (`overset.rb:123`) — asks parameterOne only. */
function isHorizontalBracket(field: unknown, context: RenderContext): boolean {
  return glyphIn(fieldGlyph(field, context), UNICODEMATH_HORIZONTAL_BRACKETS.values());
}

export function renderOverset(node: NodeOf<"overset">, context: RenderContext): string | null {
  const one = node.parameterOne;
  const two = node.parameterTwo;

  if (isAccent(one, context)) {
    return `${unicodemathParens(two, context) ?? ""}${fieldGlyph(one, context) ?? ""}`;
  }
  if (isAccent(two, context)) {
    return `${fieldGlyph(two, context) ?? ""}${renderOptionalChild(two, context)}`;
  }
  if (isHorizontalBracket(one, context)) {
    return `${renderOptionalChild(one, context)}${unicodemathParens(two, context) ?? ""}`;
  }
  if (isBraceClass(two)) {
    return `${renderOptionalChild(two, context)}^${unicodemathParens(one, context) ?? ""}`;
  }

  // `if parameter_one || parameter_two` — Ruby truthiness, so `false` counts as
  // absent, and absent yields NIL rather than raising. Measured:
  // `Overset.new(nil, nil)` and `Overset.new(false, false)` both give nil.
  // Testing `=== undefined` missed the `null` the model builder produces.
  if (!present(one) && !present(two)) return null;

  // U+2534 BOX DRAWINGS LIGHT UP AND HORIZONTAL.
  return `${unicodemathParens(two, context) ?? ""}┴${unicodemathParens(one, context) ?? ""}`;
}
