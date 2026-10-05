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

import { rubyArrayInspectOrThrow, rubyNumberToS } from "../../core/ruby-semantics";
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

/**
 * The raw (no-formatter) value both paths write into `m:t`: `result.to_s`,
 * so Ruby spells any value it can. Measured on the pinned oracle `00c52783`,
 * with the same `m:t` bytes in a `Formula` alone, inside a `Frac`, inside an
 * `Mrow` and from `to_omml_without_math_tag` directly: nil writes `<m:t></m:t>`,
 * `false`/`true` write `false`/`true`, `0` writes `0`, `[]` writes `[]` (an
 * Array's `to_s` is `inspect`).
 *
 * A finite number takes `rubyNumberToS`'s Integer reading, the answer that
 * helper documents for a `to_s` slot and the one `Symbol#initialize`'s port
 * already takes (`src/core/nodes.ts`); measured, `Number.new(0.0)` writes
 * `0.0`, which one JavaScript `0` cannot ask for. A node still refuses: Ruby
 * spells it `#<Plurimath::Math::Symbols::Symbol:0x…>`, a heap address.
 */
function rawValue(node: NodeOf<"number">): string {
  const value: unknown = node.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return rubyArrayInspectOrThrow(value, FORMAT, node.kind, "number.value");
  }
  if (typeof value === "number") {
    const printed = rubyNumberToS(value);
    if (printed !== null) return printed;
  }
  return requireString(value, node.kind, "number.value");
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
  if (active === null) return textElement(rawValue(node));
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
  if (active === null) return plainRun(rawValue(node));
  return plainRun(applyNumberFormat(active.value, active.format));
}
