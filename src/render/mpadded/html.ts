import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderUnaryDefault } from "../unary-function/html";

/** `Mpadded#to_html` inherits the unary carrier with measured label `mpadded`. */
export function renderMpadded(node: NodeOf<"mpadded">, context: RenderContext): string {
  return renderUnaryDefault("mpadded", node.parameterOne, context, "mpadded.parameterOne");
}
