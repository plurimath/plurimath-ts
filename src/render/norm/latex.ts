/**
 * Mirrors `function/norm.rb` — paired `\lVert` and `\rVert`, nil-safe.
 */

import { type NodeOf, nilSafe, type RenderContext } from "../../formats/latex/render-shared";

export function renderNorm(node: NodeOf<"norm">, context: RenderContext): string {
  return `{\\lVert ${nilSafe(node.parameterOne, context, "norm.parameterOne")} \\rVert}`;
}
