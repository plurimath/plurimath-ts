/**
 * Mirrors `function/ceil.rb` — `Ceil#to_latex` (:9):
 * `"{\\lceil #{latex_value} \\rceil}"` — the inherited `latex_value`
 * (`unary_function.rb:221`, `./unary-function.ts`), so nil interpolates to
 * "" and arrays join, where `Floor` crashes on nil (`./floor.ts`).
 */

import { type NodeOf, type RenderContext, s } from "./shared";
import { latexValue } from "./unary-function";

export function renderCeil(node: NodeOf<"ceil">, context: RenderContext): string {
  return `{\\lceil ${s(latexValue(node.parameterOne, context, "ceil.parameterOne"))} \\rceil}`;
}
