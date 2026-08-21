/**
 * Mirrors `function/ubrace.rb` — `Ubrace#to_latex` (:19): the body
 * `function/obrace.rb` repeats (see `../obrace/latex.ts` for the strict-render pin),
 * command `\underbrace`.
 */

import {
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
} from "../../formats/latex/render-shared";

export function renderUbrace(node: NodeOf<"ubrace">, context: RenderContext): string {
  return present(node.parameterOne)
    ? `\\underbrace{${s(renderChild(node.parameterOne, context, "ubrace.parameterOne"))}}`
    : "\\underbrace";
}
