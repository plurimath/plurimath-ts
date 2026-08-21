/**
 * Mirrors `function/ddot.rb` — `Ddot#to_unicodemath` (:35).
 *
 * The child goes through `unicodemath_parens`, then U+0308
 * COMBINING DIAERESIS is appended.
 *
 * The mark is a *combining* character: it follows what it modifies rather than
 * preceding it, which is why this is a suffix and not a wrapper.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { unicodemathParens } from "../../formats/unicodemath/render-shared";

/** U+0308 COMBINING DIAERESIS. */
const MARK = "\u0308";

export function renderDdot(node: NodeOf<"ddot">, context: RenderContext): string {
  return `${unicodemathParens(node.parameterOne, context) ?? ""}${MARK}`;
}
