/**
 * Mirrors `function/bar.rb` — `Bar#to_latex` (:19): the body `obrace.rb`
 * repeats (see `./obrace.ts` for the strict-render pin), command
 * `\overline` — bare on nil, CRASH on an array parameter (measured).
 */

import { type NodeOf, present, type RenderContext, renderChild, s } from "./shared";

export function renderBar(node: NodeOf<"bar">, context: RenderContext): string {
  return present(node.parameterOne)
    ? `\\overline{${s(renderChild(node.parameterOne, context, "bar.parameterOne"))}}`
    : "\\overline";
}
