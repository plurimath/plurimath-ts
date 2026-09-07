import {
  controlProperties,
  type NodeOf,
  ommlSlot,
  type RenderContext,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

/** `Sqrt#to_omml_without_math_tag`: a degree-hidden radical over one OMML slot. */
export function renderSqrt(node: NodeOf<"sqrt">, context: RenderContext): XmlElement {
  return new XmlElement("m:rad").append(
    new XmlElement("m:radPr").append(
      new XmlElement("m:degHide").setAttribute("m:val", "on"),
      controlProperties(),
    ),
    new XmlElement("m:deg"),
    ommlSlot(node.parameterOne, "e", context, node.kind, "sqrt.parameterOne"),
  );
}
