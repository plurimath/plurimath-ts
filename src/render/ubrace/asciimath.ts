/**
 * Mirrors `function/ubrace.rb` — `Ubrace#to_asciimath` (:14): the body
 * `function/obrace.rb` repeats verbatim (see `../obrace/asciimath.ts`), keyword `ubrace`.
 */

import {
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
} from "../../formats/asciimath/render-shared";

export function renderUbrace(node: NodeOf<"ubrace">, context: RenderContext): string {
  return present(node.parameterOne)
    ? `ubrace(${s(renderChild(node.parameterOne, context, "ubrace.parameterOne"))})`
    : "ubrace";
}
