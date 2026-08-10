/**
 * Mirrors `function/tilde.rb` — `Tilde#to_mathml_without_math_tag` (:13):
 * `<mover>` over [value, `<mo>~</mo>`], the mover standing with a nil
 * parameter (probe tilde-nil). The accent read is `attributes&.dig(:accent)`
 * — nil-safe where vec's is not — then the wrapper's `[]=`.
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

export function renderTilde(node: NodeOf<"tilde">, context: RenderContext): XmlElement {
  const mover = new XmlElement("mover");
  const attributes = hashOrNil(node.attributes, node.kind, "tilde.attributes");
  if (attributes !== null && present(attributes.accent)) {
    setDecodedAttribute(mover, "accent", attributes.accent, node.kind, "tilde.attributes.accent");
  }
  return mover.append(
    present(node.parameterOne)
      ? renderChild(node.parameterOne, context, "tilde.parameterOne")
      : null,
    new XmlElement("mo").append("~"),
  );
}
