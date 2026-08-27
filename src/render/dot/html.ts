import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderUnaryDefault } from "../unary-function/html";

/** `Dot#to_html` inherits the unary carrier with measured label `dot`. */
export function renderDot(node: NodeOf<"dot">, context: RenderContext): string {
  return renderUnaryDefault("dot", node.parameterOne, context, "dot.parameterOne");
}
