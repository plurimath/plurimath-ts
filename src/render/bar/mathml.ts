/**
 * Mirrors `function/bar.rb` — `Bar#to_mathml_without_math_tag` (:24): a nil
 * parameter is the bare `<mo>&#xaf;</mo>`; otherwise `<mover>` over
 * [value, `<mo>&#xaf;</mo>`], the `attributes` hash written onto the mover
 * when non-empty (probe bar-attrs; the guard's measured edges live on
 * `attributesForSetAttr`).
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

export function renderBar(node: NodeOf<"bar">, context: RenderContext): XmlElement {
  const mo = new XmlElement("mo").append("&#xaf;");
  if (!present(node.parameterOne)) return mo;
  const mover = new XmlElement("mover");
  const attributes = attributesForSetAttr(node.attributes, node.kind, "bar.attributes");
  if (attributes !== null) setAttributesFromHash(mover, attributes, node.kind, "bar.attributes");
  return mover.append(renderChild(node.parameterOne, context, "bar.parameterOne"), mo);
}
