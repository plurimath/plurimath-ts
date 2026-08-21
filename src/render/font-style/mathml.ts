/**
 * Mirrors `function/font_style.rb` — `FontStyle#to_mathml_without_math_tag`
 * (:33) — and the fourteen subclasses under `function/font_style/`: every
 * one renders `<mstyle mathvariant="...">` over the nil-safe first slot
 * (probe fontstyle-*), the variant measured per class into the generated
 * table (eight hardcode it, six resolve through `font_family`). The bare
 * carrier resolves `parameter_two` through the generated keyword table —
 * an unknown keyword passes through verbatim (probe
 * fontstyle-carrier-unknown), a nil one crashes the gem
 * (`parameter_to_class`'s `nil.to_sym` — probe fontstyle-carrier-nil-two)
 * and raises here.
 */

import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  type RenderContext,
  renderChild,
  setDecodedAttribute,
  unreachableName,
} from "../../formats/mathml/render-shared";
import {
  MATHML_FONT_STYLE_CARRIER_VARIANTS,
  MATHML_FONT_STYLE_VARIANTS,
} from "../../generated/mathml/render-tables";
import { XmlElement } from "../../xml/index";

export function renderFontStyle(node: NodeOf<"fontStyle">, context: RenderContext): XmlElement {
  let variant: string;
  if (node.name === undefined) {
    variant = carrierVariant(node);
  } else {
    const measured = MATHML_FONT_STYLE_VARIANTS.get(node.name);
    if (measured === undefined) throw unreachableName(node.kind, node.name);
    variant = measured;
  }
  const mstyle = new XmlElement("mstyle");
  setDecodedAttribute(mstyle, "mathvariant", variant, node.kind, "fontStyle.mathvariant");
  if (node.parameterOne !== null && node.parameterOne !== undefined) {
    mstyle.append(renderChild(node.parameterOne, context, "fontStyle.parameterOne"));
  }
  return mstyle;
}

/**
 * `font_family(mathml: true)` for the bare carrier (`font_style.rb:216-240`,
 * `:276-286`): `parameter_two` through `Utility::FONT_STYLES` →
 * `SUPPORTED_FONT_STYLES`, measured per keyword; a miss falls back to
 * `parameter_two` itself. Only a string can take that path — the
 * `parameter_two.to_sym` send crashes the gem on anything else, nil
 * included.
 */
function carrierVariant(node: NodeOf<"fontStyle">): string {
  const keyword = node.parameterTwo;
  if (typeof keyword !== "string") {
    throw new RenderError(
      `fontStyle.parameterTwo: holds ${describeSlot(keyword)} — parameter_to_class ` +
        "sends to_sym to it and the gem raises (probe fontstyle-carrier-nil-two)",
      FORMAT,
      node.kind,
    );
  }
  return MATHML_FONT_STYLE_CARRIER_VARIANTS.get(keyword) ?? keyword;
}
