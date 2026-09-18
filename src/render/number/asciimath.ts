/**
 * Mirrors `number.rb` — `Number#to_asciimath` (:26): with no `formatter:`
 * option, the value interpolated raw, nil → `""` — how the whole pinned
 * corpus was generated. With one, and a value B2's first slice measures (a
 * plain digit string, `isPlainFormattableNumber`), `Formatter::Numbers::
 * TextRenderer`'s default-symbol substitution (`../../formatting/
 * number-format.ts`).
 *
 * A value that is neither refuses: `Formatter::Numbers::Source#validate_
 * numeric!` raises `Plurimath::Errors::InvalidNumber` for anything that is
 * not a gem-numeric string, and that check runs unconditionally whenever a
 * formatter is active — before the gem ever gets to decide this slice's
 * grouping/substitution does not apply. `refuseNonNumericUnderFormatter`
 * mirrors that gate; a value it lets through but `isPlainFormattableNumber`
 * already said no to (a negative number, scientific notation) is gem-valid
 * and still renders raw, unformatted — out of this slice's scope, not an
 * error.
 */

import {
  applyNumberFormat,
  FORMAT,
  interpolatedValue,
  isPlainFormattableNumber,
  type NodeOf,
  type RenderContext,
  refuseNonNumericUnderFormatter,
} from "../../formats/asciimath/render-shared";

export function renderNumber(node: NodeOf<"number">, context: RenderContext): string {
  const value = node.value;
  if (context.numberFormat !== null) {
    if (isPlainFormattableNumber(value)) return applyNumberFormat(value, context.numberFormat);
    refuseNonNumericUnderFormatter(value, FORMAT, node.kind);
  }
  return interpolatedValue(value, node.kind, "number.value");
}
