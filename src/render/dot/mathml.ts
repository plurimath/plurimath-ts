/**
 * Mirrors `function/dot.rb` — `Dot#to_mathml_without_math_tag` (:13): a nil
 * parameter is the bare `<mo>.</mo>`; otherwise `<mover>` over
 * [value, `<mo>.</mo>`], with an `accent` attribute only when
 * `attributes[:accent]` is truthy (probes dot-x / dot-nil / dot-accent).
 */

import {
  hashOrNil,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  setDecodedAttribute,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderDot(node: NodeOf<"dot">, context: RenderContext): XmlElement {
  if (!present(node.parameterOne)) return new XmlElement("mo").append(".");
  const rendered = renderChild(node.parameterOne, context, "dot.parameterOne");
  const mover = new XmlElement("mover");
  const attributes = hashOrNil(node.attributes, node.kind, "dot.attributes");
  if (attributes !== null && present(attributes.accent)) {
    setDecodedAttribute(mover, "accent", attributes.accent, node.kind, "dot.attributes.accent");
  }
  return mover.append(rendered, new XmlElement("mo").append("."));
}
