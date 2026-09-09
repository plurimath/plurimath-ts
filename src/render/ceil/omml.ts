import {
  type NodeOf,
  ommlFormulaSlot,
  present,
  type RenderContext,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderCeil(node: NodeOf<"ceil">, context: RenderContext): XmlElement {
  const properties = new XmlElement("m:dPr").append(
    present(node.openParen) ? null : new XmlElement("m:begChr").setAttribute("m:val", "⌈"),
    new XmlElement("m:sepChr").setAttribute("m:val", ""),
    present(node.closeParen) ? null : new XmlElement("m:endChr").setAttribute("m:val", "⌉"),
  );
  return new XmlElement("m:d").append(
    properties,
    ommlFormulaSlot(node.parameterOne, "e", context, node.kind, "ceil.parameterOne"),
  );
}
