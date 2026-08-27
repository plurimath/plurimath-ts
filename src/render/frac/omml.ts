import {
  type NodeOf,
  ommlParameter,
  type RenderContext,
  requireEmptyOptions,
  structuralProperties,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderFrac(node: NodeOf<"frac">, context: RenderContext): XmlElement {
  requireEmptyOptions(node.options, node.kind, "frac.options");
  return new XmlElement("m:f").append(
    structuralProperties("f"),
    ommlParameter(node.parameterOne, "num", context, node.kind, "frac.parameterOne"),
    ommlParameter(node.parameterTwo, "den", context, node.kind, "frac.parameterTwo"),
  );
}
