/**
 * Mirrors `function/base.rb` — `Base#to_asciimath` (:35): the first slot
 * bare, the second behind `_` and wrapped.
 */

import { type NodeOf, present, type RenderContext, renderChild, s, wrapped } from "./shared";

export function renderBase(node: NodeOf<"base">, context: RenderContext): string {
  const one = present(node.parameterOne)
    ? s(renderChild(node.parameterOne, context, "base.parameterOne"))
    : "";
  const two = present(node.parameterTwo)
    ? `_${wrapped(node.parameterTwo, context, "base.parameterTwo")}`
    : "";
  return `${one}${two}`;
}
