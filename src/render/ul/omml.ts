import {
  type NodeOf,
  ommlSlot,
  plainRun,
  present,
  type RenderContext,
  renderLiteralScript,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderUl(node: NodeOf<"ul">, context: RenderContext): XmlElement {
  if (!present(node.parameterOne)) return plainRun("&#x332;");
  if (!present(node.attributes.accentunder)) {
    return renderLiteralScript(node.kind, "Low", node.parameterOne, "&#x332;", context, false);
  }

  const properties = new XmlElement("m:groupChrPR").append(
    new XmlElement("m:chr").setAttribute("m:val", "_"),
    new XmlElement("m:pos").setAttribute("m:val", "bot"),
  );
  return new XmlElement("m:groupChr").append(
    properties,
    ommlSlot(node.parameterOne, "e", context, node.kind, "ul.parameterOne"),
  );
}
