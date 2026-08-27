import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderUnaryDefault } from "../unary-function/html";

/** `Hat#to_html` inherits the unary carrier with measured label `^`. */
export function renderHat(node: NodeOf<"hat">, context: RenderContext): string {
  return renderUnaryDefault("^", node.parameterOne, context, "hat.parameterOne");
}
