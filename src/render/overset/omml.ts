import { type NodeOf, type RenderContext, renderOverUnder } from "../../formats/omml/render-shared";
import type { XmlElement } from "../../xml/index";

export function renderOverset(node: NodeOf<"overset">, context: RenderContext): XmlElement {
  return renderOverUnder(node.kind, "Upp", node.parameterOne, node.parameterTwo, context);
}
