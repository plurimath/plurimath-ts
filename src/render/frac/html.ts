import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderBinaryDefault } from "../binary-function/html";

/** `Frac#to_html` is inherited from `BinaryFunction`. */
export function renderFrac(node: NodeOf<"frac">, context: RenderContext): string {
  return renderBinaryDefault(node.parameterOne, node.parameterTwo, context, "frac");
}
