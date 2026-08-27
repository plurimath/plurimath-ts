import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderUnaryDefault } from "../unary-function/html";

/** `Norm#to_html` inherits the unary carrier with measured label `norm`. */
export function renderNorm(node: NodeOf<"norm">, context: RenderContext): string {
  return renderUnaryDefault("norm", node.parameterOne, context, "norm.parameterOne");
}
