import {
  type NodeOf,
  ommlSlot,
  type RenderContext,
  structuralProperties,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderBase(node: NodeOf<"base">, context: RenderContext): XmlElement {
  // Base#to_omml_without_math_tag does not inspect its stored options.
  return new XmlElement("m:sSub").append(
    structuralProperties("sSub"),
    ommlSlot(node.parameterOne, "e", context, node.kind, "base.parameterOne"),
    ommlSlot(node.parameterTwo, "sub", context, node.kind, "base.parameterTwo"),
  );
}
