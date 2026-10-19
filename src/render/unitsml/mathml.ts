/** Mirrors function/unitsml.rb:36-48 and :102-110 on the pinned oracle. */
import { RenderError } from "../../core/index";
import {
  expandUnitsml,
  type NodeOf,
  type RenderContext,
  unitsmlXml,
  unitsmlXmlForEmbedding,
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
    const fragment = readXml(
      `<mrow>${unitsmlXmlForEmbedding(unitsmlXml(node.text, context.unitsml))}</mrow>`,
    );
    const elements = fragment.children.filter(
      (child): child is XmlReadElement => child.kind === "element",
    );
    const first = elements[0];
    const xref = first?.attributes.find(([name]) => localName(name) === "id")?.[1];
    if (xref !== undefined) rendered.setAttribute("xref", xref);
    rendered.append(elements.map(copyElement));
  }
  return rendered;
}

function copyElement(node: XmlReadElement): XmlElement {
  if (node.name === null) throw new RenderError("Unnamed UnitsML XML element", "mathml", "unitsml");
  // This path uses the gem's raw Ox loader with strip_namespace: true,
  // independently of the Lutaml reader used for MathML/OMML input.
  const attributes = node.attributes.map(([name, value]) => [localName(name), value] as const);
  const result = new XmlElement(localName(node.name))
    .setAttributes(node.xmlns)
    .setAttributes(attributes);
  for (const child of node.children) {
    if (child.kind === "element") result.append(copyElement(child));
    else if (child.kind === "text" || child.kind === "cdata") result.append(child.text);
  }
  return result;
}

function localName(name: string): string {
  return name.slice(name.indexOf(":") + 1);
}
