import { type NodeOf, type RenderContext, renderFixedNary } from "../../formats/omml/render-shared";
import type { XmlElement } from "../../xml/index";

export function renderProd(node: NodeOf<"prod">, context: RenderContext): XmlElement {
  return renderFixedNary(node, context, "∏", "undOvr", "&#x220f;");
}
