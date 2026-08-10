/**
 * Mirrors `function/abs.rb` — `Abs#to_mathml_without_math_tag` (:9):
 * `<mrow>` over the value with a `<mo>|</mo>` pipe on each side — each pipe
 * SKIPPED when the matching paren field is truthy (`unless open_paren`; the
 * field's content is never rendered — probe abs-openparen). `intentify` is
 * identity with intent off.
 */

import {
  mathmlValue,
  type NodeOf,
  present,
  type RenderContext,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderAbs(node: NodeOf<"abs">, context: RenderContext): XmlElement {
  const parts = mathmlValue(node.parameterOne, context, "abs.parameterOne");
  if (!present(node.openParen)) parts.unshift(new XmlElement("mo").append("|"));
  if (!present(node.closeParen)) parts.push(new XmlElement("mo").append("|"));
  return new XmlElement("mrow").append(parts);
}
