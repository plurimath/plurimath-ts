/**
 * Mirrors `function/prod.rb` — `Prod#to_asciimath` (:37): the body `function/int.rb`
 * repeats verbatim (see `../int/asciimath.ts` for the strip pin), keyword `prod`.
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
