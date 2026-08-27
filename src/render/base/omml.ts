import {
  type NodeOf,
  ommlParameter,
  type RenderContext,
  requireEmptyOptions,
  structuralProperties,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderBase(node: NodeOf<"base">, context: RenderContext): XmlElement {
  requireEmptyOptions(node.options, node.kind, "base.options");
  return new XmlElement("m:sSub").append(
    structuralProperties("sSub"),
    ommlParameter(node.parameterOne, "e", context, node.kind, "base.parameterOne"),
    ommlParameter(node.parameterTwo, "sub", context, node.kind, "base.parameterTwo"),
  );
}
