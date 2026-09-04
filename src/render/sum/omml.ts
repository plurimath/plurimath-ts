import { type NodeOf, type RenderContext, renderFixedNary } from "../../formats/omml/render-shared";
import type { XmlElement } from "../../xml/index";

export function renderSum(node: NodeOf<"sum">, context: RenderContext): XmlElement {
  return renderFixedNary(node, context, "∑", "undOvr", "&#x2211;");
}
