/**
 * Mirrors `function/hat.rb` — `Hat#to_asciimath` (:14): the body `function/obrace.rb`
 * repeats verbatim (see `../obrace/asciimath.ts`), keyword `hat`.
 */

import {
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
} from "../../formats/asciimath/render-shared";

export function renderHat(node: NodeOf<"hat">, context: RenderContext): string {
  return present(node.parameterOne)
    ? `hat(${s(renderChild(node.parameterOne, context, "hat.parameterOne"))})`
    : "hat";
}
