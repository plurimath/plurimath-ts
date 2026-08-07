/**
 * Mirrors `function/ul.rb` — `Ul#to_asciimath` (:14): the obrace-shaped body,
 * except it spells its class name `underline`.
 */

import { type NodeOf, present, type RenderContext, renderChild, s } from "./shared";

export function renderUl(node: NodeOf<"ul">, context: RenderContext): string {
  return present(node.parameterOne)
    ? `underline(${s(renderChild(node.parameterOne, context, "ul.parameterOne"))})`
    : "underline";
}
