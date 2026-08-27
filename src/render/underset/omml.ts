import {
  type NodeOf,
  ommlSlot,
  type RenderContext,
  renderLimit,
  rubyTruthy,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderUnderset(node: NodeOf<"underset">, context: RenderContext): XmlElement {
  if (!rubyTruthy(node.options.accentunder)) {
    return renderLimit(node.kind, "Low", node.parameterOne, node.parameterTwo, context);
  }

  const properties = new XmlElement("m:groupChrPR").append(
    new XmlElement("m:chr").setAttribute("m:val", "_"),
    new XmlElement("m:pos").setAttribute("m:val", "bot"),
  );
  return new XmlElement("m:groupChr").append(
    properties,
    ommlSlot(node.parameterTwo, "e", context, node.kind, "underset.parameterTwo"),
  );
}
