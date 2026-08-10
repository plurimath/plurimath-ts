/**
 * Mirrors `function/obrace.rb` — `Obrace#to_mathml_without_math_tag` (:14):
 * the bar-shaped body over `<mover>`, accent text `&#x23de;` (probes
 * obrace-x / obrace-nil).
 */

import {
  attributesForSetAttr,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  setAttributesFromHash,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderObrace(node: NodeOf<"obrace">, context: RenderContext): XmlElement {
  const mo = new XmlElement("mo").append("&#x23de;");
  if (!present(node.parameterOne)) return mo;
  const mover = new XmlElement("mover");
  const attributes = attributesForSetAttr(node.attributes, node.kind, "obrace.attributes");
  if (attributes !== null) setAttributesFromHash(mover, attributes, node.kind, "obrace.attributes");
  return mover.append(renderChild(node.parameterOne, context, "obrace.parameterOne"), mo);
}
