import { rubyArrayInspectOrThrow, rubyNumberToS } from "../../core/ruby-semantics";
import {
  applyNumberFormat,
  FORMAT,
  interpolatedValue,
  isGemNumericValue,
  type NodeOf,
  type RenderContext,
  refuseNonNumericUnderFormatter,
} from "../../formats/html/render-shared";

/**
 * `Number#to_html`: with no `formatter:` option, the raw value through
 * Ruby's text-number spelling, nil is empty. With one, and a gem-numeric
 * value (`isGemNumericValue`), the numeric pipeline
 * (`../../formatting/number-format.ts`).
 *
 * A value that is neither refuses, matching `Formatter::Numbers::
 * Source#validate_numeric!` (`../../formatting/number-format.ts`'s
 * `refuseNonNumericUnderFormatter`).
 *
 * The raw path is `Formatter::Numbers::TextRenderer`'s `result.to_s`, so it
 * spells any value Ruby can: measured on the pinned oracle `00c52783`, with no
 * formatter, `Number.new([])` renders `"[]"` (Array's `to_s` is `inspect`) and
 * `Number.new(0)` renders `"0"`, alone, inside a `Frac` and inside an `Mrow`
 * alike. Both arms are answered HERE, not in `interpolatedValue`, which also
 * serves slots that do not reach Ruby through `to_s` and so must keep refusing.
 *
 * A finite number takes `rubyNumberToS`'s Integer reading, the answer that
 * helper documents for a `to_s` slot and the one `Symbol#initialize`'s port
 * already takes (`src/core/nodes.ts`). The ambiguity is real and is accepted
 * the same way there: measured, `Number.new(0.0)` renders `"0.0"`, and one
 * JavaScript `0` cannot say it meant the Float. A node in this slot still
 * refuses: Ruby spells it `#<Plurimath::Math::Symbols::Symbol:0x…>`, a heap
 * address.
 */
export function renderNumber(node: NodeOf<"number">, context: RenderContext): string {
  const value: unknown = node.value;
  if (context.numberFormat !== null) {
    if (isGemNumericValue(value)) return applyNumberFormat(value, context.numberFormat, FORMAT);
    refuseNonNumericUnderFormatter(value, FORMAT, node.kind);
  }
  // Only the raw path below was measured for these two arms; a formatter
  // refuses both above, as it refuses every non-numeric value.
  if (Array.isArray(value)) {
    return rubyArrayInspectOrThrow(value, FORMAT, node.kind, "number.value");
  }
  if (typeof value === "number") {
    const printed = rubyNumberToS(value);
    if (printed !== null) return printed;
  }
  return interpolatedValue(value, node.kind, "number.value");
}
