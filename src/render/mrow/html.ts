import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderFormulaValue } from "../formula/html";

/** `Mrow` inherits `Formula#to_html` unchanged. */
export function renderMrow(node: NodeOf<"mrow">, context: RenderContext): string {
  return renderFormulaValue(node.value, context, "mrow");
}
