import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderUnaryDefault } from "../unary-function/html";

/** `Tilde#to_html` inherits the unary carrier with measured label `~`. */
export function renderTilde(node: NodeOf<"tilde">, context: RenderContext): string {
  return renderUnaryDefault("~", node.parameterOne, context, "tilde.parameterOne");
}
