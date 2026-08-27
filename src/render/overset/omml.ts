import { type NodeOf, type RenderContext, renderLimit } from "../../formats/omml/render-shared";
import type { XmlElement } from "../../xml/index";

export function renderOverset(node: NodeOf<"overset">, context: RenderContext): XmlElement {
  return renderLimit(node.kind, "Upp", node.parameterOne, node.parameterTwo, context);
}
