/**
 * Mirrors `function/bar.rb` — `Bar#to_unicodemath` (:62).
 *
 * The child goes through `unicodemath_parens`, then U+0305
 * COMBINING OVERLINE is appended.
 *
 * The mark is a *combining* character: it follows what it modifies rather than
 * preceding it, which is why this is a suffix and not a wrapper.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { unicodemathParens } from "../../formats/unicodemath/render-shared";

/** U+0305 COMBINING OVERLINE. */
const MARK = "\u0305";

export function renderBar(node: NodeOf<"bar">, context: RenderContext): string {
  return `${unicodemathParens(node.parameterOne, context) ?? ""}${MARK}`;
}
