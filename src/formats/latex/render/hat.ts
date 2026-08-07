/**
 * Mirrors `function/hat.rb` — `Hat#to_latex` (:19): the body `obrace.rb`
 * repeats (see `./obrace.ts` for the strict-render pin), command `\hat`.
 */

import { type NodeOf, present, type RenderContext, renderChild, s } from "./shared";

export function renderHat(node: NodeOf<"hat">, context: RenderContext): string {
  return present(node.parameterOne)
    ? `\\hat{${s(renderChild(node.parameterOne, context, "hat.parameterOne"))}}`
    : "\\hat";
}
