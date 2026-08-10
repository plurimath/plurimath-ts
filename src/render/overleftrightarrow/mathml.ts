/**
 * Mirrors `function/overleftrightarrow.rb` —
 * `Overleftrightarrow#to_mathml_without_math_tag` (:14): the vec-shaped
 * body, accent text `&#x20e1;` (probes olra-x / olra-nil).
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

export function renderOverleftrightarrow(
  node: NodeOf<"overleftrightarrow">,
  context: RenderContext,
): XmlElement {
  const mover = new XmlElement("mover");
  const attributes = hashOrNil(node.attributes, node.kind, "overleftrightarrow.attributes");
  if (attributes !== null && present(attributes.accent)) {
    setDecodedAttribute(
      mover,
      "accent",
      attributes.accent,
      node.kind,
      "overleftrightarrow.attributes.accent",
    );
  }
  return mover.append(
    node.parameterOne === null || node.parameterOne === undefined
      ? null
      : renderChild(node.parameterOne, context, "overleftrightarrow.parameterOne"),
    new XmlElement("mo").append("&#x20e1;"),
  );
}
