import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderBinaryDefault } from "../binary-function/html";

/** `Color#to_html` is inherited from `BinaryFunction`. */
export function renderColor(node: NodeOf<"color">, context: RenderContext): string {
  return renderBinaryDefault(node.parameterOne, node.parameterTwo, context, "color");
}
