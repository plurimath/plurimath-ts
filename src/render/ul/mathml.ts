/**
 * Mirrors `function/ul.rb` — `Ul#to_mathml_without_math_tag` (:24): the
 * bar-shaped body over `<munder>`, accent text `&#x332;` (probes ul-x /
 * ul-nil).
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

export function renderUl(node: NodeOf<"ul">, context: RenderContext): XmlElement {
  const mo = new XmlElement("mo").append("&#x332;");
  if (!present(node.parameterOne)) return mo;
  const munder = new XmlElement("munder");
  const attributes = attributesForSetAttr(node.attributes, node.kind, "ul.attributes");
  if (attributes !== null) setAttributesFromHash(munder, attributes, node.kind, "ul.attributes");
  return munder.append(renderChild(node.parameterOne, context, "ul.parameterOne"), mo);
}
