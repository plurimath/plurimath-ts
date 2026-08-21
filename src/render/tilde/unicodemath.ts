/**
 * Mirrors `function/tilde.rb` — `Tilde#to_unicodemath` (:40).
 *
 * The child goes through `unicodemath_parens`, then U+0303
 * COMBINING TILDE is appended.
 *
 * The mark is a *combining* character: it follows what it modifies rather than
 * preceding it, which is why this is a suffix and not a wrapper.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { unicodemathParens } from "../../formats/unicodemath/render-shared";

/** U+0303 COMBINING TILDE. */
const MARK = "\u0303";

export function renderTilde(node: NodeOf<"tilde">, context: RenderContext): string {
  return `${unicodemathParens(node.parameterOne, context) ?? ""}${MARK}`;
}
