import {
  controlProperties,
  type NodeOf,
  ommlSlot,
  plainRun,
  present,
  type RenderContext,
  renderAccent,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderBar(node: NodeOf<"bar">, context: RenderContext): XmlElement {
  if (!present(node.parameterOne)) return plainRun("&#xaf;");
  if (present(node.attributes.accent)) {
    return renderAccent(node.kind, node.parameterOne, "‾", context, "bar.parameterOne");
  }

  const properties = new XmlElement("m:barPr").append(
    new XmlElement("m:pos").setAttribute("m:val", "top"),
    controlProperties(),
  );
  return new XmlElement("m:bar").append(
    properties,
    ommlSlot(node.parameterOne, "e", context, node.kind, "bar.parameterOne"),
  );
}
