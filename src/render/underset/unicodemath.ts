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
 * The final branch has no nil guard in the gem: `parameter_one.to_unicodemath`
 * raises when it is nil, which the port surfaces as a typed `RenderError`
 * through the shared child renderer rather than as a crash.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import {
  fieldGlyph,
  glyphIn,
  isNode,
  renderOptionalChild,
  unicodemathParens,
} from "../../formats/unicodemath/render-shared";
import {
  UNICODEMATH_ACCENT_SYMBOLS,
  UNICODEMATH_DIACRITIC_BELOWS,
  UNICODEMATH_HORIZONTAL_BRACKETS,
} from "../../generated/unicodemath/render-tables";

/** `Underset#match_unicode?` (`underset.rb:142`) — BELOWS, not OVERLAYS. */
function isAccent(field: unknown, context: RenderContext): boolean {
  const glyph = fieldGlyph(field, context);
  return (
    glyphIn(glyph, UNICODEMATH_DIACRITIC_BELOWS) ||
    glyphIn(glyph, UNICODEMATH_ACCENT_SYMBOLS.values())
  );
}

/**
 * Byte-identical to its twin in `../overset/unicodemath.ts`, on purpose.
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

function isHorizontalBracket(field: unknown, context: RenderContext): boolean {
  return glyphIn(fieldGlyph(field, context), UNICODEMATH_HORIZONTAL_BRACKETS.values());
}

export function renderUnderset(node: NodeOf<"underset">, context: RenderContext): string {
  const one = node.parameterOne;
  const two = node.parameterTwo;

  if (isHorizontalBracket(one, context)) {
    return `${renderOptionalChild(one, context)}${unicodemathParens(two, context) ?? ""}`;
  }
  if (isBraceClass(two)) {
    return `${renderOptionalChild(two, context)}_${unicodemathParens(one, context) ?? ""}`;
  }
  if (isAccent(one, context)) {
    return `${unicodemathParens(two, context) ?? ""}${fieldGlyph(one, context) ?? ""}`;
  }

  // U+252C BOX DRAWINGS LIGHT DOWN AND HORIZONTAL.
  return `${unicodemathParens(two, context) ?? ""}┬${renderOptionalChild(one, context)}`;
}
