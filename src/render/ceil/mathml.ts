/**
 * Mirrors `function/ceil.rb` — `Ceil#to_mathml_without_math_tag` (:10): the
 * abs-shaped body with `&#x2308;` / `&#x2309;` (`paren_node`, :58) — probes
 * ceil-x / ceil-nil.
 */

import {
  mathmlValue,
  type NodeOf,
  present,
  type RenderContext,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderCeil(node: NodeOf<"ceil">, context: RenderContext): XmlElement {
  const parts = mathmlValue(node.parameterOne, context, "ceil.parameterOne");
  if (!present(node.openParen)) parts.unshift(new XmlElement("mo").append("&#x2308;"));
  if (!present(node.closeParen)) parts.push(new XmlElement("mo").append("&#x2309;"));
  return new XmlElement("mrow").append(parts);
}
