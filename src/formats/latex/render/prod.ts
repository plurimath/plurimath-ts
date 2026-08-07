/**
 * Mirrors `function/prod.rb` — `Prod#to_latex` (:49): the body `int.rb`
 * repeats (see `./int.ts` for the strip pin), command `\prod`.
 */

import {
  type NodeOf,
  nilSafe,
  present,
  type RenderContext,
  renderChild,
  rubyStrip,
  s,
} from "./shared";

export function renderProd(node: NodeOf<"prod">, context: RenderContext): string {
  const one = present(node.parameterOne)
    ? `_{${s(renderChild(node.parameterOne, context, "prod.parameterOne"))}}`
    : "";
  const two = present(node.parameterTwo)
    ? `^{${s(renderChild(node.parameterTwo, context, "prod.parameterTwo"))}}`
    : "";
  const three = nilSafe(node.parameterThree, context, "prod.parameterThree");
  return rubyStrip(`\\prod${one}${two} ${three}`);
}
