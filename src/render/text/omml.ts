import { RenderError } from "../../core/index";
import {
  FORMAT,
  type NodeOf,
  type RenderContext,
  requireString,
  textElement,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

const UNICODE_TOKEN = /unicode\[:\w+\]/;

/** `Text#to_omml_without_math_tag`: direct `m:t`, with generated lookup deferred. */
export function renderText(node: NodeOf<"text">): XmlElement {
  const value = requireString(node.parameterOne, node.kind, "text.parameterOne");
  if (UNICODE_TOKEN.test(value)) {
    throw new RenderError(
      "text.parameterOne: unicode[:name] substitution needs generated OMML data, deferred to the symbol-data follow-up",
      FORMAT,
      node.kind,
    );
  }
  return textElement(value);
}

/** Default-language Text insertion adds `m:rPr/m:sty`; `lang: omml` is unmeasured. */
export function renderTextInserted(node: NodeOf<"text">, _context: RenderContext): XmlElement {
  if (node.lang !== null && node.lang !== undefined) {
    throw new RenderError(
      `Text lang "${node.lang}" has not been measured for OMML insertion in this slice`,
      FORMAT,
      node.kind,
    );
  }
  const properties = new XmlElement("m:rPr").append(
    new XmlElement("m:sty").setAttribute("m:val", "p"),
  );
  return new XmlElement("m:r").append(properties, renderText(node));
}
