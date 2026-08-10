/**
 * Mirrors `formula/mrow.rb`, which defines no `to_latex` of its own:
 * `Formula#to_latex` (`formula.rb:141`) renders it — `Mrow` is a `Formula`
 * subclass, and inherits the strict join unchanged.
 */

import type { NodeOf, RenderContext } from "../../formats/latex/render-shared";
import { renderFormulaValue } from "../formula/latex";

export function renderMrow(node: NodeOf<"mrow">, context: RenderContext): string {
  return renderFormulaValue(node.value, context, "mrow");
}
