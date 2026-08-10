/**
 * Mirrors `function/vec.rb` — `Vec#to_mathml_without_math_tag` (:14):
 * `<mover>` over [value, `<mo>&#x2192;</mo>`] — the mover stands even with
 * a nil parameter (probe vec-nil), unlike the bar family. An `accent`
 * attribute is written only when `attributes[:accent]` is truthy (probe
 * vec-accent: `accent: false` writes nothing), through the wrapper's `[]=`
 * (to_s + entity decode).
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

export function renderVec(node: NodeOf<"vec">, context: RenderContext): XmlElement {
  const mover = new XmlElement("mover");
  const attributes = hashOrNil(node.attributes, node.kind, "vec.attributes");
  if (attributes !== null && present(attributes.accent)) {
    setDecodedAttribute(mover, "accent", attributes.accent, node.kind, "vec.attributes.accent");
  }
  return mover.append(
    node.parameterOne === null || node.parameterOne === undefined
      ? null
      : renderChild(node.parameterOne, context, "vec.parameterOne"),
    new XmlElement("mo").append("&#x2192;"),
  );
}
