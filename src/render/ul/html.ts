import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderUnaryDefault } from "../unary-function/html";

/** `Ul#to_html` inherits the unary carrier with measured label `underline`. */
export function renderUl(node: NodeOf<"ul">, context: RenderContext): string {
  return renderUnaryDefault("underline", node.parameterOne, context, "ul.parameterOne");
}
