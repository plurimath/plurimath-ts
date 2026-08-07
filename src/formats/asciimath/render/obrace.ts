/**
 * Mirrors `function/obrace.rb` — `Obrace#to_asciimath` (:14):
 * `"obrace(#{parameter_one.to_asciimath})"` — strict, so a list crashes here
 * where the default unary path would have joined it. The gem repeats this
 * body verbatim in `ubrace.rb`, `bar.rb` and `hat.rb`; so does this port,
 * one file per class.
 */

import { type NodeOf, present, type RenderContext, renderChild, s } from "./shared";

export function renderObrace(node: NodeOf<"obrace">, context: RenderContext): string {
  return present(node.parameterOne)
    ? `obrace(${s(renderChild(node.parameterOne, context, "obrace.parameterOne"))})`
    : "obrace";
}
