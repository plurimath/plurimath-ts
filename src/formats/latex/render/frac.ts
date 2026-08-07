/**
 * Mirrors `function/frac.rb` — `Frac#to_latex` (:53):
 * `"\\frac{#{one}}{#{two}}"`, nil-safe on both.
 */

import { type NodeOf, nilSafe, type RenderContext } from "./shared";

export function renderFrac(node: NodeOf<"frac">, context: RenderContext): string {
  return `\\frac{${nilSafe(node.parameterOne, context, "frac.parameterOne")}}{${nilSafe(node.parameterTwo, context, "frac.parameterTwo")}}`;
}
