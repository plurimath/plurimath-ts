/**
 * Mirrors `function/overleftrightarrow.rb` — `Overleftrightarrow#to_unicodemath` (:43).
 *
 * The child goes through `unicodemath_parens`, then U+20E1
 * COMBINING LEFT RIGHT ARROW ABOVE is appended.
 *
 * The mark is a *combining* character: it follows what it modifies rather than
 * preceding it, which is why this is a suffix and not a wrapper.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { unicodemathParens } from "../../formats/unicodemath/render-shared";

/** U+20E1 COMBINING LEFT RIGHT ARROW ABOVE. */
const MARK = "\u20E1";

export function renderOverleftrightarrow(
  node: NodeOf<"overleftrightarrow">,
  context: RenderContext,
): string {
  return `${unicodemathParens(node.parameterOne, context) ?? ""}${MARK}`;
}
