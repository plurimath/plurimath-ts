import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderBinaryDefault } from "../binary-function/html";

/** `Underset#to_html` is inherited from `BinaryFunction`. */
export function renderUnderset(node: NodeOf<"underset">, context: RenderContext): string {
  return renderBinaryDefault(node.parameterOne, node.parameterTwo, context, "underset");
}
