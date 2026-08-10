/**
 * Mirrors `function/obrace.rb` — `Obrace#to_latex` (:19):
 * `"\\overbrace#{"{…}" if parameter_one}"` — a strict single render, so an
 * array parameter crashes here (measured) where the `latex_value` shapes
 * would have joined it. The gem repeats this body in `ubrace.rb`, `bar.rb`,
 * `hat.rb` and `ul.rb`, each spelling its own command; so does this port,
 * one file per class.
 */

import {
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
} from "../../formats/latex/render-shared";

export function renderObrace(node: NodeOf<"obrace">, context: RenderContext): string {
  return present(node.parameterOne)
    ? `\\overbrace{${s(renderChild(node.parameterOne, context, "obrace.parameterOne"))}}`
    : "\\overbrace";
}
