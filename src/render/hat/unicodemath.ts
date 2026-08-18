/**
 * Mirrors `function/hat.rb` — `Hat#to_unicodemath` (:61).
 *
 * The child goes through `unicodemath_parens`, then U+0302
 * COMBINING CIRCUMFLEX ACCENT is appended.
 *
 * The mark is a *combining* character: it follows what it modifies rather than
 * preceding it, which is why this is a suffix and not a wrapper.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { unicodemathParens } from "../../formats/unicodemath/render-shared";

/** U+0302 COMBINING CIRCUMFLEX ACCENT. */
const MARK = "\u0302";

export function renderHat(node: NodeOf<"hat">, context: RenderContext): string {
  return `${unicodemathParens(node.parameterOne, context) ?? ""}${MARK}`;
}
