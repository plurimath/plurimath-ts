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
 * The formatter path is deliberately the plain value here. The gem routes
 * through `Formatter::Numbers::TextRenderer` with
 * `format_value_with_options`, which falls back to the raw value whenever
 * `Plurimath.configuration.number_formatter` is nil — and it is nil by
 * default, which is the only configuration the pinned corpus was generated
 * under (`configuration: {}` in its provenance). Number formatting is P4
 * scope; wiring a formatter here would be output nothing has measured.
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
import { FORMAT, type NodeOf, present } from "../../formats/unicodemath/render-shared";
import {
  UNICODEMATH_SUB_DIGITS,
  UNICODEMATH_SUP_DIGITS,
} from "../../generated/unicodemath/render-tables";

export function renderNumber(node: NodeOf<"number">): string | null {
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
  // A list in this slot answers nothing and says nothing about it, which is the
  // failure mode this port exists to avoid: measured on the pinned oracle
  // `00c52783`, `Number([]).to_unicodemath(options: {})` is `"[]"`. Recorded in
  // TODO.plan/deferred.md under "three list slots the gem renders and this port
  // does not"; not closed here, because the fix is per-slot and this is not the
  // slot the change that found it was about.
  if (value === null) return null;

  // Ruby truthiness again, and it is visible here too: measured on the pinned
  // gem with `value` the string "1", `mini_sub_sized` set to `0` and to `""`
  // both answer "&#x2081;", the subscript digit, where `false` answers "1".
  if (present(node.miniSubSized)) return UNICODEMATH_SUB_DIGITS.get(value) ?? null;
  if (present(node.miniSupSized)) return UNICODEMATH_SUP_DIGITS.get(value) ?? null;

  return value;
}
