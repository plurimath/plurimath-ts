/**
 * Mirrors `function/abs.rb` — `Abs#to_mathml_without_math_tag` (:9):
 * `<mrow>` over the value with a `<mo>|</mo>` pipe on each side — each pipe
 * SKIPPED when the matching paren field is truthy (`unless open_paren`; the
 * field's content is never rendered — probe abs-openparen). Under intent
 * `intentify(:abs)` tags the `<mrow>` `absolute-value(<operand>)`.
 */

import {
  absIntent,
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
  const mrow = new XmlElement("mrow").append(parts);
  return context.intent ? absIntent(mrow, "absolute-value") : mrow;
}
