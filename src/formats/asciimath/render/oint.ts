/**
 * Mirrors `function/oint.rb` — `Oint#to_asciimath` (:27): the body `int.rb`
 * repeats verbatim (see `./int.ts` for the strip pin), keyword `oint`.
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

export function renderOint(node: NodeOf<"oint">, context: RenderContext): string {
  const one = present(node.parameterOne)
    ? `_${wrapped(node.parameterOne, context, "oint.parameterOne")}`
    : "";
  const two = present(node.parameterTwo)
    ? `^${wrapped(node.parameterTwo, context, "oint.parameterTwo")}`
    : "";
  const three =
    node.parameterThree === null || node.parameterThree === undefined
      ? ""
      : s(renderChild(node.parameterThree, context, "oint.parameterThree"));
  return rubyStrip(`oint${one}${two} ${three}`);
}
