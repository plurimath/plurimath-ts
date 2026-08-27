import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderUnaryDefault } from "../unary-function/html";

/** `Vec#to_html` inherits the unary carrier with measured label `&#x2192;`. */
export function renderVec(node: NodeOf<"vec">, context: RenderContext): string {
  return renderUnaryDefault("&#x2192;", node.parameterOne, context, "vec.parameterOne");
}
