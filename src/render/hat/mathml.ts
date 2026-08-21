/**
 * Mirrors `function/hat.rb` — `Hat#to_mathml_without_math_tag` (:24): the
 * body `function/bar.rb` repeats verbatim (see `../bar/mathml.ts`), accent text `^`
 * (probes hat-x / hat-nil).
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

export function renderHat(node: NodeOf<"hat">, context: RenderContext): XmlElement {
  const mo = new XmlElement("mo").append("^");
  if (!present(node.parameterOne)) return mo;
  const mover = new XmlElement("mover");
  const attributes = attributesForSetAttr(node.attributes, node.kind, "hat.attributes");
  if (attributes !== null) setAttributesFromHash(mover, attributes, node.kind, "hat.attributes");
  return mover.append(renderChild(node.parameterOne, context, "hat.parameterOne"), mo);
}
