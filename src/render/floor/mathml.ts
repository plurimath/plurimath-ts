/**
 * Mirrors `function/floor.rb` — `Floor#to_mathml_without_math_tag` (:13):
 * the abs shape with `&#x230a;` / `&#x230b;`, but over a SINGLE rendered
 * parameter (`parameter_one&.to_mathml_without_math_tag`, no `mathml_value`
 * list handling — a bare list parameter crashes the gem where ceil's would
 * render, and raises here). A nil parameter contributes nothing between the
 * brackets (probe floor-nil).
 */

import {
  type MathmlRendered,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderFloor(node: NodeOf<"floor">, context: RenderContext): XmlElement {
  const parts: MathmlRendered[] = [
    node.parameterOne === null || node.parameterOne === undefined
      ? null
      : renderChild(node.parameterOne, context, "floor.parameterOne"),
  ];
  if (!present(node.openParen)) parts.unshift(new XmlElement("mo").append("&#x230a;"));
  if (!present(node.closeParen)) parts.push(new XmlElement("mo").append("&#x230b;"));
  return new XmlElement("mrow").append(parts);
}
