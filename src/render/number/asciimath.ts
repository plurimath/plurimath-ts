/**
 * Mirrors `number.rb` — `Number#to_asciimath` (:26): with no `formatter:`
 * option, the value interpolated raw, nil → `""` — how the whole pinned
 * corpus was generated. With one, and a gem-numeric value
 * (`isGemNumericValue`), `Formatter::Numbers::TextRenderer` over the numeric
 * pipeline (`../../formatting/number-format.ts`).
 *
 * A value that is neither refuses: `Formatter::Numbers::Source#validate_
 * numeric!` raises `Plurimath::Errors::InvalidNumber` for anything that is
 * not a gem-numeric string, and that check runs unconditionally whenever a
 * formatter is active. `refuseNonNumericUnderFormatter` mirrors that gate.
 */

import {
  applyNumberFormat,
  FORMAT,
  interpolatedValue,
  isGemNumericValue,
  type NodeOf,
  type RenderContext,
  refuseNonNumericUnderFormatter,
} from "../../formats/asciimath/render-shared";

export function renderNumber(node: NodeOf<"number">, context: RenderContext): string {
  const value = node.value;
  if (context.numberFormat !== null) {
    if (isGemNumericValue(value)) return applyNumberFormat(value, context.numberFormat, FORMAT);
    refuseNonNumericUnderFormatter(value, FORMAT, node.kind);
  }
  return interpolatedValue(value, node.kind, "number.value");
}
