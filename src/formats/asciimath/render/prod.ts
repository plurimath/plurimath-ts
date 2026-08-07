/**
 * Mirrors `function/prod.rb` — `Prod#to_asciimath` (:37): the body `int.rb`
 * repeats verbatim (see `./int.ts` for the strip pin), keyword `prod`.
 */

import {
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  rubyStrip,
  s,
  wrapped,
} from "./shared";

export function renderProd(node: NodeOf<"prod">, context: RenderContext): string {
  const one = present(node.parameterOne)
    ? `_${wrapped(node.parameterOne, context, "prod.parameterOne")}`
    : "";
  const two = present(node.parameterTwo)
    ? `^${wrapped(node.parameterTwo, context, "prod.parameterTwo")}`
    : "";
  const three =
    node.parameterThree === null || node.parameterThree === undefined
      ? ""
      : s(renderChild(node.parameterThree, context, "prod.parameterThree"));
  return rubyStrip(`prod${one}${two} ${three}`);
}
