import {
  type NodeOf,
  ommlSlot,
  present,
  type RenderContext,
  wordRunProperties,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderAbs(node: NodeOf<"abs">, context: RenderContext): XmlElement {
  const properties = new XmlElement("m:dPr").append(
    wordRunProperties(false),
    present(node.openParen) ? null : new XmlElement("m:begChr").setAttribute("m:val", "|"),
    present(node.closeParen) ? null : new XmlElement("m:endChr").setAttribute("m:val", "|"),
    new XmlElement("m:sepChr").setAttribute("m:val", ""),
    new XmlElement("m:grow"),
  );
  return new XmlElement("m:d").append(
    properties,
    ommlSlot(node.parameterOne, "e", context, node.kind, "abs.parameterOne"),
  );
}
