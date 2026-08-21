/**
 * Mirrors `function/vec.rb` — `Vec#to_unicodemath` (:43).
 *
 * The child goes through `unicodemath_parens`, then U+20D7
 * COMBINING RIGHTWARDS ARROW ABOVE is appended.
 *
 * The mark is a *combining* character: it follows what it modifies rather than
 * preceding it, which is why this is a suffix and not a wrapper.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { unicodemathParens } from "../../formats/unicodemath/render-shared";

/** U+20D7 COMBINING RIGHTWARDS ARROW ABOVE. */
const MARK = "\u20D7";

export function renderVec(node: NodeOf<"vec">, context: RenderContext): string {
  return `${unicodemathParens(node.parameterOne, context) ?? ""}${MARK}`;
}
