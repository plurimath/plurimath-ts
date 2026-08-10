/**
 * Mirrors `number.rb` — `Number#to_mathml_without_math_tag` (:32) →
 * `Formatter::Numbers::MathmlRenderer.plain_element` (mathml_renderer.rb:50):
 * with no formatter configured — the only supported state, `formatter` being
 * deferred — `format_value_with_options` returns the raw value and the
 * render is `<mn>` over `value.to_s`. A nil value is the long-form
 * `<mn></mn>` (probe number-nil: `to_s` of nil is the empty STRING child,
 * not an absent one). The interpolation guard is the shared one: a finite
 * JS number is ambiguous (`5` vs `5.0`) and raises.
 */

import { interpolatedValue, type NodeOf } from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderNumber(node: NodeOf<"number">): XmlElement {
  return new XmlElement("mn").append(interpolatedValue(node.value, node.kind, "number.value"));
}
