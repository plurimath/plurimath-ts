/**
 * Mirrors `function/dot.rb` — `Dot#to_unicodemath` (:47).
 *
 * Same shape as the other combining accents, with one difference kept from the
 * gem: `Dot` guards `parameter_one` before wrapping, so a missing child yields
 * the bare mark rather than `()` with the mark on it. `Bar` and friends do not
 * guard, and `unicodemath_parens` returns nil for a nil field, so they reach
 * the same output by a different route — the distinction only shows if
 * `unicodemath_parens` ever stops returning nil.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { unicodemathParens } from "../../formats/unicodemath/render-shared";

/** U+0307 COMBINING DOT ABOVE. */
const MARK = "̇";

export function renderDot(node: NodeOf<"dot">, context: RenderContext): string {
  const value =
    node.parameterOne === undefined ? "" : (unicodemathParens(node.parameterOne, context) ?? "");
  return `${value}${MARK}`;
}
