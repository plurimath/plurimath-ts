/**
 * Mirrors `function/sqrt.rb` — `Sqrt#to_mathml_without_math_tag` (:9):
 * `<msqrt>` over `Array(parameter_one&.to_mathml...)` — nil renders the
 * self-closing `<msqrt/>` (probe sqrt-nil), a wrapperless formula splices
 * (Array of an Array stays itself).
 */

import { type NodeOf, type RenderContext, renderChild } from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderSqrt(node: NodeOf<"sqrt">, context: RenderContext): XmlElement {
  const msqrt = new XmlElement("msqrt");
  if (node.parameterOne !== null && node.parameterOne !== undefined) {
    msqrt.append(renderChild(node.parameterOne, context, "sqrt.parameterOne"));
  }
  return msqrt;
}
