/**
 * Mirrors `function/ubrace.rb` — `Ubrace#to_mathml_without_math_tag` (:14):
 * the bar-shaped body over `<munder>`, accent text `&#x23df;` (probes
 * ubrace-x / ubrace-nil). Its `tag_name` override ("underover",
 * `function/ubrace.rb:40`) matters to `PowerBase`, whose kind file consults
 * `slotKind` for it.
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

export function renderUbrace(node: NodeOf<"ubrace">, context: RenderContext): XmlElement {
  const mo = new XmlElement("mo").append("&#x23df;");
  if (!present(node.parameterOne)) return mo;
  const munder = new XmlElement("munder");
  const attributes = attributesForSetAttr(node.attributes, node.kind, "ubrace.attributes");
  if (attributes !== null)
    setAttributesFromHash(munder, attributes, node.kind, "ubrace.attributes");
  return munder.append(renderChild(node.parameterOne, context, "ubrace.parameterOne"), mo);
}
