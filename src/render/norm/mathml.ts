/**
 * Mirrors `function/norm.rb` — `Norm#to_mathml_without_math_tag` (:17):
 * `Array(parameter_one&.to_mathml...)` with a `<mo>&#x2225;</mo>` on each
 * side, each skipped when the matching paren field is truthy — probes
 * norm-x / norm-nil.
 */

import {
  type MathmlRendered,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderNorm(node: NodeOf<"norm">, context: RenderContext): XmlElement {
  const rendered =
    node.parameterOne === null || node.parameterOne === undefined
      ? null
      : renderChild(node.parameterOne, context, "norm.parameterOne");
  // `Array(x)`: nil is [], an array stays itself, anything else wraps.
  const parts: MathmlRendered[] =
    rendered === null ? [] : Array.isArray(rendered) ? [...rendered] : [rendered];
  if (!present(node.openParen)) parts.unshift(new XmlElement("mo").append("&#x2225;"));
  if (!present(node.closeParen)) parts.push(new XmlElement("mo").append("&#x2225;"));
  return new XmlElement("mrow").append(parts);
}
