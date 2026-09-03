import {
  type NodeOf,
  plainRun,
  type RenderContext,
  requireString,
  textElement,
} from "../../formats/omml/render-shared";
import type { XmlElement } from "../../xml/index";

/** `Number#to_omml_without_math_tag`: the format-neutral value in `m:t`. */
export function renderNumber(node: NodeOf<"number">): XmlElement {
  return textElement(requireString(node.value, node.kind, "number.value"));
}

export function renderNumberInserted(node: NodeOf<"number">, _context: RenderContext): XmlElement {
  return plainRun(requireString(node.value, node.kind, "number.value"));
}
