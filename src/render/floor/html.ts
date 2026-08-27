import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderUnaryDefault } from "../unary-function/html";

/** `Floor#to_html` inherits the unary carrier with measured label `floor`. */
export function renderFloor(node: NodeOf<"floor">, context: RenderContext): string {
  return renderUnaryDefault("floor", node.parameterOne, context, "floor.parameterOne");
}
