/**
 * Mirrors `function/frac.rb` — `Frac#to_asciimath` (:27): both slots always
 * parenthesized directly (not through `wrapped` — a nil slot contributes no
 * `()` at all).
 */

import {
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
} from "../../formats/asciimath/render-shared";

export function renderFrac(node: NodeOf<"frac">, context: RenderContext): string {
  const one = present(node.parameterOne)
    ? `(${s(renderChild(node.parameterOne, context, "frac.parameterOne"))})`
    : "";
  const two = present(node.parameterTwo)
    ? `(${s(renderChild(node.parameterTwo, context, "frac.parameterTwo"))})`
    : "";
  return `frac${one}${two}`;
}
