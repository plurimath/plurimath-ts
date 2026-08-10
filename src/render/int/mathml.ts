/**
 * Mirrors `function/int.rb` — `Int#to_mathml_without_math_tag` (:22): with
 * no value anywhere, the bare `<mo>&#x222b;</mo>` (the text via
 * `invert_unicode_symbols`, generated); otherwise ALWAYS `<msubsup>` with
 * `<mrow/>` placeholders for missing sub/sup (`validate_mathml_tag`,
 * ternary_function.rb:237 — probes int-sub / int-sup); a third slot appends
 * behind the msubsup in an outer `<mrow>` (identity `wrap_mrow`, intent
 * off — probe int-all). `options[:mask]` is checked by KEY (`int.rb:34`):
 * only the inert `limits_default` decoding is supported
 * (`assertMaskIsInert`).
 */

import {
  assertMaskIsInert,
  hashOrNil,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  requireElement,
} from "../../formats/mathml/render-shared";
import { MATHML_UNICODE_INVERT } from "../../generated/mathml/render-tables";
import { XmlElement } from "../../xml/index";

export function renderInt(node: NodeOf<"int">, context: RenderContext): XmlElement {
  const base = new XmlElement("mo").append(MATHML_UNICODE_INVERT.get("int") ?? "int");
  if (!present(node.parameterOne) && !present(node.parameterTwo) && !present(node.parameterThree)) {
    return base;
  }
  const msubsup = new XmlElement("msubsup").append(
    base,
    validateMathmlTag(node.parameterOne, context, "int.parameterOne"),
    validateMathmlTag(node.parameterTwo, context, "int.parameterTwo"),
  );
  const options = hashOrNil(node.options, node.kind, "int.options");
  if (options !== null && Object.hasOwn(options, "mask")) {
    assertMaskIsInert(options.mask, node.kind, "int.options.mask");
  }
  if (node.parameterThree === null || node.parameterThree === undefined) return msubsup;
  const third = requireElement(
    renderChild(node.parameterThree, context, "int.parameterThree"),
    node.kind,
    "int.parameterThree",
  );
  return new XmlElement("mrow").append(msubsup, third);
}

/**
 * `TernaryFunction#validate_mathml_tag` (ternary_function.rb:237-241): a nil
 * parameter contributes an EMPTY `<mrow/>` placeholder, everything else its
 * own render.
 */
function validateMathmlTag(
  value: NodeOf<"int">["parameterOne"],
  context: RenderContext,
  at: string,
) {
  // `return Array(...ox_element("mrow")) unless parameter` — Ruby
  // truthiness, so `false` takes the placeholder too.
  if (!present(value)) return new XmlElement("mrow");
  return renderChild(value, context, at);
}
