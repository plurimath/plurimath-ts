/**
 * Mirrors `function/oint.rb` — `Oint#to_mathml_without_math_tag` (:51): the
 * `<mo>&#x222e;</mo>` head (EMPTY `<mo/>` under `hide_function_name` —
 * probe oint-hide-bare) returned bare when no value exists; otherwise
 * `<msubsup>`/`<msub>`/`<msup>` by which of the first two slots are present
 * — nil slots contribute NOTHING here, no `<mrow/>` placeholders (probes
 * oint-sub / oint-sup, unlike int) — and a third slot appends behind it in
 * an outer `<mrow>` (`ternary_intentify` is identity, intent off).
 */

import {
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  requireElement,
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
  if (node.parameterThree === null || node.parameterThree === undefined) return script;
  const third = requireElement(
    renderChild(node.parameterThree, context, "oint.parameterThree"),
    node.kind,
    "oint.parameterThree",
  );
  return new XmlElement("mrow").append(script, third);
}
