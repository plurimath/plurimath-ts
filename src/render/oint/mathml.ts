/**
 * Mirrors `function/oint.rb` — `Oint#to_mathml_without_math_tag` (:51): the
 * `<mo>&#x222e;</mo>` head (EMPTY `<mo/>` under `hide_function_name` —
 * probe oint-hide-bare) returned bare when no value exists; otherwise
 * `<msubsup>`/`<msub>`/`<msup>` by which of the first two slots are present
 * — nil slots contribute NOTHING here, no `<mrow/>` placeholders (probes
 * oint-sub / oint-sup, unlike int) — and a third slot appends behind it in
 * an outer `<mrow>`. Under intent the third slot is wrapped in `<mrow>` unless
 * it is one (`wrap_mrow`) and `ternary_intentify` tags the result
 * `:contour integral(...)` — on the script itself when there is no third slot.
 */

import {
  type NodeOf,
  naryandIntent,
  present,
  type RenderContext,
  renderChild,
  wrapMrow,
} from "../../formats/mathml/render-shared";
import { MATHML_UNICODE_INVERT } from "../../generated/mathml/render-tables";
import { XmlElement } from "../../xml/index";

export function renderOint(node: NodeOf<"oint">, context: RenderContext): XmlElement {
  const mo = new XmlElement("mo");
  if (!present(node.hideFunctionName)) mo.append(MATHML_UNICODE_INVERT.get("oint") ?? "oint");
  if (!present(node.parameterOne) && !present(node.parameterTwo) && !present(node.parameterThree)) {
    return mo;
  }
  const tag =
    present(node.parameterOne) && present(node.parameterTwo)
      ? "msubsup"
      : present(node.parameterOne)
        ? "msub"
        : "msup";
  // `parameter_one&.to_mathml...`: `&.` guards nil alone, so a `false` slot
  // still crashes the gem (NoMethodError) and raises here via renderChild.
  const script = new XmlElement(tag).append(
    mo,
    node.parameterOne === null || node.parameterOne === undefined
      ? null
      : renderChild(node.parameterOne, context, "oint.parameterOne"),
    node.parameterTwo === null || node.parameterTwo === undefined
      ? null
      : renderChild(node.parameterTwo, context, "oint.parameterTwo"),
  );
  const intentName = ":contour integral";
  if (node.parameterThree === null || node.parameterThree === undefined) {
    return context.intent ? naryandIntent(script, intentName) : script;
  }
  const third = wrapMrow(
    renderChild(node.parameterThree, context, "oint.parameterThree"),
    context.intent,
    node.kind,
    "oint.parameterThree",
  );
  const mrow = new XmlElement("mrow").append(script, third);
  return context.intent ? naryandIntent(mrow, intentName) : mrow;
}
