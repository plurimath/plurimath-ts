/**
 * Mirrors `function/ubrace.rb` — `Ubrace#to_asciimath` (:14): the body
 * `obrace.rb` repeats verbatim (see `./obrace.ts`), keyword `ubrace`.
 */

import { type NodeOf, present, type RenderContext, renderChild, s } from "./shared";

export function renderUbrace(node: NodeOf<"ubrace">, context: RenderContext): string {
  return present(node.parameterOne)
    ? `ubrace(${s(renderChild(node.parameterOne, context, "ubrace.parameterOne"))})`
    : "ubrace";
}
