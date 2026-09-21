/**
 * Mirrors `number.rb` — `Number#to_latex` (:36): `Formatter::Numbers::
 * TextRenderer`. With no `formatter:` option, renders the raw value, nil →
 * `""` — which is how the whole pinned corpus was generated. With one, and a
 * value B2's first slice measures (a plain digit string,
 * `isPlainFormattableNumber`), the default-symbol substitution
 * (`../../formatting/number-format.ts`).
 *
 * "Renders the raw value" (the no-formatter path) is `result.to_s`
 * (`text_renderer.rb:25`, the arm every non-`FormattedNumber` result takes),
 * and for an Array that `to_s` IS `inspect` — so a LIST in this slot renders
 * rather than raising. Measured on the pinned oracle `00c52783`,
 * `Number.new([]).to_latex(options: {})` is `"[]"` and
 * `[nil, [true, "a"]]` is `'[nil, [true, "a"]]'`. That admission belongs
 * here and not in `interpolatedValue`, which serves this file,
 * `../symbol/latex.ts` and `../color/latex.ts`: a list means a different
 * thing at each of those, and the shared judge carries a note saying so.
 * Measured, `Color([], Symbol("x"))` and `Color([Symbol("a")], …)` raise
 * `NoMethodError` in the gem where `Color(Number([]), …)` renders — the slot
 * has to hold a NODE whose `to_asciimath` answers the inspect.
 *
 * A list never reaches a configured formatter in the gem either:
 * `Formatter::Numbers::Source.new(number_string, ...)` expects a numeric
 * string, and this port has not measured what `Source.new` does with an
 * Array's `to_s`. So the list arm below is checked BEFORE `numberFormat`,
 * unconditionally.
 */

import { rubyArrayInspectOrThrow } from "../../core/ruby-semantics";
import {
  applyNumberFormat,
  FORMAT,
  interpolatedValue,
  isPlainFormattableNumber,
  type NodeOf,
  type RenderContext,
  refuseNonNumericUnderFormatter,
} from "../../formats/latex/render-shared";

export function renderNumber(node: NodeOf<"number">, context: RenderContext): string {
  // Measured on the pinned oracle `00c52783`: `Number([]).to_latex(options: {})`
  // is `"[]"`. `interpolatedValue` used to refuse that, which
  // TODO.plan/deferred.md recorded as a known gap — and said why widening
  // `interpolatedValue` would be the WRONG way to close it, since this slot
  // does not reach Ruby through a bare `"#{}"` at all but through
  // `Formatter::Numbers::TextRenderer`. So it is closed here instead, with the
  // dedicated judge.
  //
  // The declared slot type is `string | null`; a list arrives only from a
  // caller that has already violated it, which is the same door every other
  // degenerate shape here comes through.
  const value: unknown = node.value;
  if (Array.isArray(value)) {
    return rubyArrayInspectOrThrow(value, FORMAT, node.kind, "number.value");
  }
  if (context.numberFormat !== null) {
    if (isPlainFormattableNumber(value)) return applyNumberFormat(value, context.numberFormat);
    // `Formatter::Numbers::Source#validate_numeric!` raises for anything that
    // is not a gem-numeric string — a value it lets through but not-plain
    // (negative, scientific notation) is gem-valid and still renders raw.
    refuseNonNumericUnderFormatter(value, FORMAT, node.kind);
  }
  return interpolatedValue(value, node.kind, "number.value");
}
