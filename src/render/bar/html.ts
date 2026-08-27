import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderUnaryDefault } from "../unary-function/html";

/** `Bar#to_html` inherits the unary carrier with measured label `¯`. */
export function renderBar(node: NodeOf<"bar">, context: RenderContext): string {
  return renderUnaryDefault("¯", node.parameterOne, context, "bar.parameterOne");
}
