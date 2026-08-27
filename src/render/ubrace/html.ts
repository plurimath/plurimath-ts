import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderUnaryDefault } from "../unary-function/html";

/** `Ubrace#to_html` inherits the unary carrier with measured label `&#x23df;`. */
export function renderUbrace(node: NodeOf<"ubrace">, context: RenderContext): string {
  return renderUnaryDefault("&#x23df;", node.parameterOne, context, "ubrace.parameterOne");
}
