/**
 * Mirrors `number.rb`'s two OMML paths, which format a number differently:
 *
 *   - `Number#insert_t_tag` / `#font_style_t_tag` / `#t_tag` — the path every
 *     number inside a formula takes (a formula's items, a fraction's slots, a
 *     power's base, a root, a fence, an n-ary's limits...) — writes
 *     `format_value_with_options(options).to_s` into one `m:r`/`m:t`, whatever
 *     the formatter answered. So a `scientific` number is the flat text
 *     `1.234'567'891 x 10^6`, and a semantic base (`base` with no prefix or
 *     postfix) is `FormattedNumber#to_s` with its default prefix: `0xff`, NOT
 *     the `ff` subscript 16 the other path draws, and not asciimath's
 *     `ff_(16)`. That inconsistency is the gem's, reproduced on purpose
 *     (TODO.plan/deferred.md, "OMML: a semantic base renders as prefixed text
 *     on the insert path").
 *   - `Number#to_omml_without_math_tag` — reached when the number itself is
 *     the node rendered (the per-node entry, or a parent that renders a child
 *     node rather than inserting it) — hands the result to
 *     `Formatter::Numbers::OmmlRenderer.render`: a `scientific`/`engineering`
 *     notation is an `m:sSup` (coefficient, `" x "`, `10` runs; the exponent
 *     as the superscript), a semantic base is an `m:sSub` (sign and digits;
 *     the base as the subscript), and anything else is a bare `m:t`.
 *
 * With no `formatter:` option both paths write the raw value. With one, a
 * value that is not gem-numeric refuses, matching `Formatter::Numbers::
 * Source#validate_numeric!` (`refuseNonNumericUnderFormatter`). The measured
 * cases, with the oracle command, are `test/formatting/number-formatter-omml.spec.ts`.
 */

import {
  applyNumberFormat,
  FORMAT,
  formatNumberForMathml,
  isGemNumericValue,
  type NodeOf,
  type NumberFormat,
  plainRun,
  type RenderContext,
  refuseNonNumericUnderFormatter,
  requireString,
  structuralProperties,
  textElement,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

/**
 * The active formatter and the value to format, or `null` for the raw path
 * (no formatter). A non-numeric value under a formatter refuses here.
 */
function formatting(
  node: NodeOf<"number">,
  context: RenderContext,
): { readonly value: string; readonly format: NumberFormat } | null {
  const format = context.numberFormat;
  if (format === null) return null;
  const value = node.value;
  if (!isGemNumericValue(value)) {
    refuseNonNumericUnderFormatter(value, FORMAT, node.kind);
    return null;
  }
  return { value, format };
}

/** `OmmlRenderer#render_notation`'s and `#render_semantic_base`'s two-slot script. */
function script(name: "sSup" | "sSub", base: readonly string[], scriptText: string): XmlElement {
  const scriptSlot = name === "sSup" ? "sup" : "sub";
  return new XmlElement(`m:${name}`).append(
    structuralProperties(name),
    new XmlElement("m:e").append(base.map((text) => plainRun(text))),
    new XmlElement(`m:${scriptSlot}`).append(plainRun(scriptText)),
  );
}

/** `Number#to_omml_without_math_tag`: `OmmlRenderer.render` over the formatter's result. */
export function renderNumber(node: NodeOf<"number">, context: RenderContext): XmlElement {
  const active = formatting(node, context);
  if (active === null) return textElement(requireString(node.value, node.kind, "number.value"));
  const number = formatNumberForMathml(active.value, active.format);
  switch (number.kind) {
    case "plain":
      return textElement(number.text);
    case "notation":
      return script("sSup", [number.coefficient, ` ${number.times} `, "10"], number.exponent);
    case "base":
      return script("sSub", [`${number.sign ?? ""}${number.digits}`], String(number.base));
  }
}

/** `Number#insert_t_tag`: the formatter's result as flat text (`to_s`) in `m:r`/`m:t`. */
export function renderNumberInserted(node: NodeOf<"number">, context: RenderContext): XmlElement {
  const active = formatting(node, context);
  if (active === null) return plainRun(requireString(node.value, node.kind, "number.value"));
  return plainRun(applyNumberFormat(active.value, active.format));
}
