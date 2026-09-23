/**
 * Mirrors `number.rb` — `Number#to_unicodemath` (:52).
 *
 * Mini-sizing comes first and short-circuits: a mini-sub or mini-sup number
 * renders as its subscript/superscript digit and never reaches the formatter.
 * `mini_sub`/`mini_sup` (`number.rb:103`/`:107`) index the digit tables and
 * yield **nil** for anything not a single digit, which the gem returns as-is.
 *
 * That "anything" is narrower than it reads: the index is `value.to_sym`, so
 * only a String or a Symbol gets as far as a lookup MISS. Measured on the
 * pinned oracle `00c52783`, a mini-sized number whose value is a list, nil, a
 * boolean, a number or a hash raises `NoMethodError` (undefined method
 * `to_sym`) instead. The list arm below refuses for that reason; the other
 * shapes are a pre-existing divergence this change does not touch — `nil`
 * with a mini flag still answers `null` here where the gem raises.
 *
 * With no `formatter:` option, the gem routes through `Formatter::Numbers::
 * TextRenderer` with `format_value_with_options`, which falls back to the raw
 * value whenever `Plurimath.configuration.number_formatter` is nil — and it
 * is nil by default, which is the only configuration the pinned corpus was
 * generated under (`configuration: {}` in its provenance). With one, and a
 * gem-numeric value (`isGemNumericValue`), the numeric pipeline
 * (`../../formatting/number-format.ts`) — but only past the mini-sizing
 * short-circuit above, exactly where the gem's own formatter read sits
 * (`number.rb:115`, after the `mini_sub`/`mini_sup` returns at `:103`/`:107`).
 *

 * "The plain value" is `result.to_s` (`text_renderer.rb:25`), and for an
 * Array that `to_s` IS `inspect`: `Number.new([]).to_unicodemath(options: {})`
 * is `"[]"`, and inside a formula join `Formula([Number([]), Symbol("x")])`
 * is `"[] x"`. Before the list arm below, this function returned the ARRAY
 * ITSELF from a `string | null` signature — no error, no bytes, and
 * `String([])` is `""`, so the operand disappeared from every join it was in
 * (that formula rendered `" x"`). A refusal is a bug a caller can see; that
 * one they could not.
 */

import { RenderError } from "../../core/index";
import { rubyArrayInspectOrThrow } from "../../core/ruby-semantics";
import {
  applyNumberFormat,
  FORMAT,
  isGemNumericValue,
  type NodeOf,
  present,
  type RenderContext,
  refuseNonNumericUnderFormatter,
} from "../../formats/unicodemath/render-shared";
import {
  UNICODEMATH_SUB_DIGITS,
  UNICODEMATH_SUP_DIGITS,
} from "../../generated/unicodemath/render-tables";

export function renderNumber(node: NodeOf<"number">, context: RenderContext): string | null {
  // The declared slot type is `string | null`; a list arrives only from a
  // caller that has already violated it, so the list test reads the slot as
  // `unknown` and everything below keeps the declared type.
  const raw: unknown = node.value;
  if (Array.isArray(raw)) {
    // The gem's mini short-circuit runs BEFORE the formatter, so it is what a
    // mini-sized list meets — and it sends `to_sym` to the Array.
    //
    // `present` and not `||`: `number.rb:53-54` guards with a bare `if`, so
    // Ruby truthiness decides, and `0` and `""` are TRUE there. Measured on
    // the pinned gem with `value` a list — `mini_sub_sized` set to `0` and to
    // `""` both raise `NoMethodError: undefined method 'to_sym' for an
    // instance of Array`, exactly as `true` does, while `false` returns
    // `"[]"`. JavaScript truthiness would have skipped the refusal for the
    // first two and answered `"[]"` for all three.
    if (present(node.miniSubSized) || present(node.miniSupSized)) {
      throw new RenderError(
        "number.value: a mini-sized number indexes the digit table with " +
          "`value.to_sym` (`number.rb:103`), and a list answers no to_sym — " +
          "the gem raises NoMethodError here",
        FORMAT,
        node.kind,
      );
    }
    return rubyArrayInspectOrThrow(raw, FORMAT, node.kind, "number.value");
  }

  const value = node.value;
  // The list case for this slot is already closed above: a list arrives only
  // as `raw`, and `Array.isArray(raw)` returns before reaching this point, so
  // `value` here is never an array.
  if (value === null) {
    // A mini-sized `null` is a PRE-EXISTING divergence this change does not
    // touch: the gem's `mini_sub`/`mini_sup` send `to_sym` to `nil` and raise
    // NoMethodError before a formatter is ever consulted, where this returns
    // `null`. Left as-is, so the refusal below applies only to the
    // non-mini-sized case, which is what `number.rb:115`'s formatter read
    // actually reaches for a `null` value: `nil.to_s` is `""`, and `""` fails
    // `Source::NUMERIC_PATTERN`, so an active formatter refuses it too.
    if (present(node.miniSubSized) || present(node.miniSupSized)) return null;
    if (context.numberFormat !== null) refuseNonNumericUnderFormatter(value, FORMAT, node.kind);
    return null;
  }

  // Ruby truthiness again, and it is visible here too: measured on the pinned
  // gem with `value` the string "1", `mini_sub_sized` set to `0` and to `""`
  // both answer "&#x2081;", the subscript digit, where `false` answers "1".
  if (present(node.miniSubSized)) return UNICODEMATH_SUB_DIGITS.get(value) ?? null;
  if (present(node.miniSupSized)) return UNICODEMATH_SUP_DIGITS.get(value) ?? null;

  if (context.numberFormat !== null) {
    if (isGemNumericValue(value)) return applyNumberFormat(value, context.numberFormat, FORMAT);
    // `Formatter::Numbers::Source#validate_numeric!` raises for anything that
    // is not a gem-numeric string.
    refuseNonNumericUnderFormatter(value, FORMAT, node.kind);
  }
  return value;
}
