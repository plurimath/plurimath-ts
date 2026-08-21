/**
 * Mirrors `function/sum.rb` — `Sum#to_asciimath` (:38): the body `function/int.rb`
 * repeats verbatim (see `../int/asciimath.ts` for the strip pin), keyword `sum`.
 */

import {
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  rubyStrip,
  s,
  wrapped,
} from "../../formats/asciimath/render-shared";

export function renderSum(node: NodeOf<"sum">, context: RenderContext): string {
  const one = present(node.parameterOne)
    ? `_${wrapped(node.parameterOne, context, "sum.parameterOne")}`
    : "";
  const two = present(node.parameterTwo)
    ? `^${wrapped(node.parameterTwo, context, "sum.parameterTwo")}`
    : "";
  const three =
    node.parameterThree === null || node.parameterThree === undefined
      ? ""
      : s(renderChild(node.parameterThree, context, "sum.parameterThree"));
  return rubyStrip(`sum${one}${two} ${three}`);
}
