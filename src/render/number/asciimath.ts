/**
 * Mirrors `number.rb` — `Number#to_asciimath` (:26): with no `formatter:`
 * option, the value interpolated raw, nil → `""` — how the whole pinned
 * corpus was generated. With one, and a value B2's first slice measures (a
 * plain digit string, `isPlainFormattableNumber`), `Formatter::Numbers::
 * TextRenderer`'s default-symbol substitution (`../../formatting/
 * number-format.ts`).
 */

import {
  applyNumberFormat,
  interpolatedValue,
  isPlainFormattableNumber,
  type NodeOf,
  type RenderContext,
} from "../../formats/asciimath/render-shared";

export function renderNumber(node: NodeOf<"number">, context: RenderContext): string {
  const value = node.value;
  if (context.numberFormat !== null && isPlainFormattableNumber(value)) {
    return applyNumberFormat(value, context.numberFormat);
  }
  return interpolatedValue(value, node.kind, "number.value");
}
