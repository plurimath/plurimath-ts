/**
 * Mirrors `number.rb` — `Number#to_unicodemath` (:52).
 *
 * Mini-sizing comes first and short-circuits: a mini-sub or mini-sup number
 * renders as its subscript/superscript digit and never reaches the formatter.
 * `mini_sub`/`mini_sup` (`number.rb:103`/`:107`) index the digit tables and
 * yield **nil** for anything not a single digit, which the gem returns as-is.
 *
 * The formatter path is deliberately the plain value here. The gem routes
 * through `Formatter::Numbers::TextRenderer` with
 * `format_value_with_options`, which falls back to the raw value whenever
 * `Plurimath.configuration.number_formatter` is nil — and it is nil by
 * default, which is the only configuration the pinned corpus was generated
 * under (`configuration: {}` in its provenance). Number formatting is P4
 * scope; wiring a formatter here would be output nothing has measured.
 */

import type { NodeOf } from "../../formats/unicodemath/render-shared";
import {
  UNICODEMATH_SUB_DIGITS,
  UNICODEMATH_SUP_DIGITS,
} from "../../generated/unicodemath/render-tables";

export function renderNumber(node: NodeOf<"number">): string | null {
  const value = node.value;
  if (value === null) return null;

  if (node.miniSubSized) return UNICODEMATH_SUB_DIGITS.get(value) ?? null;
  if (node.miniSupSized) return UNICODEMATH_SUP_DIGITS.get(value) ?? null;

  return value;
}
