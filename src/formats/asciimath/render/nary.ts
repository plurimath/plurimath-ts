/**
 * Mirrors `function/nary.rb` — `Nary#to_asciimath` (:33): a nil first value
 * falls back to `"int"` — including a first value whose own render is
 * Ruby-nil (`|| "int"`), which is how a bare `FontStyle` in the first slot
 * still yields `int`.
 */

import { type NodeOf, present, type RenderContext, renderChild, s } from "./shared";

export function renderNary(node: NodeOf<"nary">, context: RenderContext): string {
  const first =
    node.parameterOne === null || node.parameterOne === undefined
      ? "int"
      : (renderChild(node.parameterOne, context, "nary.parameterOne") ?? "int");
  const second = present(node.parameterTwo)
    ? `_(${s(renderChild(node.parameterTwo, context, "nary.parameterTwo"))})`
    : "";
  const third = present(node.parameterThree)
    ? `^(${s(renderChild(node.parameterThree, context, "nary.parameterThree"))})`
    : "";
  const fourth = present(node.parameterFour)
    ? ` ${s(renderChild(node.parameterFour, context, "nary.parameterFour"))}`
    : "";
  return `${first}${second}${third}${fourth}`;
}
