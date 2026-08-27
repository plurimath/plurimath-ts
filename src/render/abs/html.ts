import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderUnaryDefault } from "../unary-function/html";

/** `Abs#to_html` is inherited from `UnaryFunction`; measured through `Abs.new(x)`. */
export function renderAbs(node: NodeOf<"abs">, context: RenderContext): string {
  return renderUnaryDefault("abs", node.parameterOne, context, "abs.parameterOne");
}
