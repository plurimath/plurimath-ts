import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderUnaryDefault } from "../unary-function/html";

/** `Sqrt#to_html` inherits the unary carrier with measured label `sqrt`. */
export function renderSqrt(node: NodeOf<"sqrt">, context: RenderContext): string {
  return renderUnaryDefault("sqrt", node.parameterOne, context, "sqrt.parameterOne");
}
