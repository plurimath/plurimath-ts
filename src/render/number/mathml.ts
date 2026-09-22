/**
 * Mirrors `number.rb` — `Number#to_mathml_without_math_tag` (:32) →
 * `Formatter::Numbers::MathmlRenderer.plain_element` (formatter/numbers/mathml_renderer.rb:50):
 * with no formatter configured, `format_value_with_options` returns the raw
 * value and the render is `<mn>` over `value.to_s`. A nil value is the
 * long-form `<mn></mn>` (probe number-nil: `to_s` of nil is the empty STRING
 * child, not an absent one). The interpolation guard is the shared one: a
 * finite JS number is ambiguous (`5` vs `5.0`) and raises.
 *
 * With a formatter active, and a gem-numeric value (`isGemNumericValue`), the
 * same numeric pipeline the four text renderers already thread through
 * (`../../formatting/number-format.ts`) — `<mn>` wraps the formatted string
 * instead of the raw one; a `scientific`/`engineering` notation is the
 * structured `<mrow>` `renderFormattedNumber` builds. A value that is not numeric refuses, matching
 * `Formatter::Numbers::Source#validate_numeric!`
 * (`refuseNonNumericUnderFormatter`).
 */

import {
  FORMAT,
  interpolatedValue,
  isGemNumericValue,
  type NodeOf,
  type RenderContext,
  refuseNonNumericUnderFormatter,
  renderFormattedNumber,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderNumber(node: NodeOf<"number">, context: RenderContext): XmlElement {
  const value = node.value;
  if (context.numberFormat !== null) {
    if (isGemNumericValue(value)) return renderFormattedNumber(value, context.numberFormat);
    refuseNonNumericUnderFormatter(value, FORMAT, node.kind);
  }
  return new XmlElement("mn").append(interpolatedValue(value, node.kind, "number.value"));
}
