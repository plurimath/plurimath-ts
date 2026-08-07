/**
 * Mirrors `function/norm.rb` — `Norm#to_latex` (:13): `\lVert` on BOTH
 * sides (the gem never writes `\rVert`), nil-safe single render.
 */

import { type NodeOf, nilSafe, type RenderContext } from "../../formats/latex/render-shared";

export function renderNorm(node: NodeOf<"norm">, context: RenderContext): string {
  return `{\\lVert ${nilSafe(node.parameterOne, context, "norm.parameterOne")} \\lVert}`;
}
