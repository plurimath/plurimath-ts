/**
 * Mirrors `function/ceil.rb` — `Ceil#to_latex` (:9):
 * `"{\\lceil #{latex_value} \\rceil}"` — the inherited `latex_value`
 * (`unary_function.rb:221`, `../unary-function/latex.ts`), so nil interpolates to
 * "" and arrays join, where `Floor` crashes on nil (`../floor/latex.ts`).
 */

import { type NodeOf, type RenderContext, s } from "../../formats/latex/render-shared";
import { latexValue } from "../unary-function/latex";

export function renderCeil(node: NodeOf<"ceil">, context: RenderContext): string {
  return `{\\lceil ${s(latexValue(node.parameterOne, context, "ceil.parameterOne"))} \\rceil}`;
}
