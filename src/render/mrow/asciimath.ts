/**
 * Mirrors `formula/mrow.rb`, which defines no `to_asciimath` of its own:
 * `Formula#to_asciimath` (`formula.rb:66`) renders it — `Mrow` is a `Formula`
 * subclass, and inherits the strict join unchanged.
 */

import type { NodeOf, RenderContext } from "../../formats/asciimath/render-shared";
import { renderFormulaValue } from "../formula/asciimath";

export function renderMrow(node: NodeOf<"mrow">, context: RenderContext): string {
  return renderFormulaValue(node.value, context, "mrow");
}
