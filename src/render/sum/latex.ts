/**
 * Mirrors `function/sum.rb` — `Sum#to_latex` (:50): the body `int.rb`
 * repeats (see `../int/latex.ts` for the strip pin), command `\sum`.
 */

import {
  type NodeOf,
  nilSafe,
  present,
  type RenderContext,
  renderChild,
  rubyStrip,
  s,
} from "../../formats/latex/render-shared";

export function renderSum(node: NodeOf<"sum">, context: RenderContext): string {
  const one = present(node.parameterOne)
    ? `_{${s(renderChild(node.parameterOne, context, "sum.parameterOne"))}}`
    : "";
  const two = present(node.parameterTwo)
    ? `^{${s(renderChild(node.parameterTwo, context, "sum.parameterTwo"))}}`
    : "";
  const three = nilSafe(node.parameterThree, context, "sum.parameterThree");
  return rubyStrip(`\\sum${one}${two} ${three}`);
}
