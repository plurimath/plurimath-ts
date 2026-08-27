import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderBinaryDefault } from "../binary-function/html";

/** `Overset#to_html` is inherited from `BinaryFunction`. */
export function renderOverset(node: NodeOf<"overset">, context: RenderContext): string {
  return renderBinaryDefault(node.parameterOne, node.parameterTwo, context, "overset");
}
