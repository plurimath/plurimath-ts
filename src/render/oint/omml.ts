import { type NodeOf, type RenderContext, renderFixedNary } from "../../formats/omml/render-shared";
import type { XmlElement } from "../../xml/index";

export function renderOint(node: NodeOf<"oint">, context: RenderContext): XmlElement {
  return renderFixedNary(node, context, "∮", "subSup", "&#x222e;");
}
