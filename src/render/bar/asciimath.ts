/**
 * Mirrors `function/bar.rb` — `Bar#to_asciimath` (:14): the body `obrace.rb`
 * repeats verbatim (see `../obrace/asciimath.ts`), keyword `bar`.
 */

import {
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
} from "../../formats/asciimath/render-shared";

export function renderBar(node: NodeOf<"bar">, context: RenderContext): string {
  return present(node.parameterOne)
    ? `bar(${s(renderChild(node.parameterOne, context, "bar.parameterOne"))})`
    : "bar";
}
