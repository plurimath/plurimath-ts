/** Mirrors function/unitsml.rb:36-48 and :102-110 on the pinned oracle. */
import { RenderError } from "../../core/index";
import {
  expandUnitsml,
  type NodeOf,
  type RenderContext,
  unitsmlXml,
} from "../../formats/mathml/render-shared";
import { readXml, XmlElement, type XmlReadElement } from "../../xml/index";

export function renderUnitsml(node: NodeOf<"unitsml">, context: RenderContext): XmlElement {
  const rendered = context.render(expandUnitsml(node.text, context.unitsml));
  if (!(rendered instanceof XmlElement)) {
    throw new RenderError("UnitsML formula did not render an element", "mathml", "unitsml");
  }
  rendered.setAttribute("unitsml", "true");
  if (
    context.unitsml?.xml !== null &&
    context.unitsml?.xml !== undefined &&
    context.unitsml.xml !== false
  ) {
    const fragment = readXml(`<mrow>${unitsmlXml(node.text, context.unitsml)}</mrow>`);
    const elements = fragment.children.filter(
      (child): child is XmlReadElement => child.kind === "element",
    );
    const first = elements[0];
    const xref = first?.attributes.find(([name]) => name === "id")?.[1];
    if (xref !== undefined) rendered.setAttribute("xref", xref);
    rendered.append(elements.map(copyElement));
  }
  return rendered;
}

function copyElement(node: XmlReadElement): XmlElement {
  if (node.name === null) throw new RenderError("Unnamed UnitsML XML element", "mathml", "unitsml");
  const result = new XmlElement(node.name).setAttributes(node.xmlns).setAttributes(node.attributes);
  for (const child of node.children) {
    if (child.kind === "element") result.append(copyElement(child));
    else if (child.kind === "text" || child.kind === "cdata") result.append(child.text);
  }
  return result;
}
