import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderUnaryDefault } from "../unary-function/html";

/** `Obrace#to_html` inherits the unary carrier with measured label `&#x23de;`. */
export function renderObrace(node: NodeOf<"obrace">, context: RenderContext): string {
  return renderUnaryDefault("&#x23de;", node.parameterOne, context, "obrace.parameterOne");
}
