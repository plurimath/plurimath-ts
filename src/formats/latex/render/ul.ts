/**
 * Mirrors `function/ul.rb` — `Ul#to_latex` (:19): the obrace-shaped body
 * (see `./obrace.ts` for the strict-render pin), except it spells its
 * command `\underline`.
 */

import { type NodeOf, present, type RenderContext, renderChild, s } from "./shared";

export function renderUl(node: NodeOf<"ul">, context: RenderContext): string {
  return present(node.parameterOne)
    ? `\\underline{${s(renderChild(node.parameterOne, context, "ul.parameterOne"))}}`
    : "\\underline";
}
