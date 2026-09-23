/**
 * Ruby's numeric kinds, as far as this slice's arithmetic can observe them.
 *
 * The gem computes with Ruby `Integer` and `Float` values and follows Ruby's
 * own promotion rules (`numeric.c`), so `2+3` is the Integer `5`, `6/3` is the
 * Float `2.0`, `2^100` is an arbitrary-precision Integer and `2^(-1)` is the
 * Rational `(1/2)`. JavaScript has one `number` type, so this port carries
 * each intermediate value together with the Ruby kind it would have
 * (`RubyNumeric`) and applies Ruby's promotion rules to the kind, not just the
 * value. Two things follow:
 *
 * - The public result is a plain `number` either way (`index.ts`'s
 *   `evaluate`): the gem's README documents numeric results (`5.0`, `9`) and
 *   nothing more, and Integer-versus-Float is not observable in JavaScript.
 * - Where Ruby would produce a value JavaScript cannot hold exactly — an
 *   Integer outside `Number.isSafeInteger`, or any Rational — this port
 *   refuses with `UnsupportedFeatureError` at the operation that would
 *   produce it, instead of answering with a rounded or different number.
 *   `TODO.plan/open-decisions.md`'s "Evaluation return type" has the decision.
 *
 * Every rule below was measured on the pinned oracle (`00c52783`, Ruby's
 * `Integer#**`/`Float#**` as `fix_pow`/`rb_float_pow` implement them), and
 * `test/evaluation/evaluate.spec.ts` checks the kind of every fixture row
 * against the kind the oracle recorded.
 */

import { UnsupportedFeatureError } from "../core/errors";
import { DivisionByZeroError, MathDomainError } from "./errors";
import { correctlyRoundedPow } from "./pow";

/** Ruby's `Integer` or `Float` — the two kinds this slice can produce. */
export type RubyKind = "integer" | "float";

/** A computed value and the Ruby class it would have. */
export interface RubyNumeric {
  readonly value: number;
  readonly kind: RubyKind;
}

/** The `feature` identifier every refusal from this module carries. */
const FEATURE = "evaluate";

function unrepresentableInteger(): never {
  throw new UnsupportedFeatureError(
    FEATURE,
    "the result is a Ruby Integer outside JavaScript's safe-integer range " +
      "(Number.MAX_SAFE_INTEGER), which a JS number cannot hold exactly",
  );
}

function rationalResult(): never {
  throw new UnsupportedFeatureError(
    FEATURE,
    "an Integer raised to a negative Integer power is a Ruby Rational, " +
      "which a JS number cannot hold exactly",
  );
}

/**
 * A Ruby Integer. `-0` has no Integer counterpart (Ruby's `-0` and `0 * -3`
 * are both `0`), so it is normalized; a value outside the safe range is
 * refused rather than rounded.
 */
export function integer(value: number): RubyNumeric {
  if (!Number.isSafeInteger(value)) unrepresentableInteger();
  return { value: value + 0, kind: "integer" };
}

/** A Ruby Float — any IEEE-754 double, `-0.0`, `NaN` and the infinities included. */
export function float(value: number): RubyNumeric {
  return { value, kind: "float" };
}

/**
 * The kind a JS `number` binding stands for. JavaScript cannot tell `2` from
 * `2.0`, so a safe-integer value is taken as the Ruby Integer a caller writing
 * `2` most likely means, and every other value (fractions, `-0`, `NaN`, the
 * infinities, integers beyond the safe range) as a Float.
 */
export function fromBinding(value: number): RubyNumeric {
  return Number.isSafeInteger(value) && !Object.is(value, -0) ? integer(value) : float(value);
}

function bothIntegers(left: RubyNumeric, right: RubyNumeric): boolean {
  return left.kind === "integer" && right.kind === "integer";
}

/** Ruby `+`: Integer + Integer is an Integer; anything with a Float is a Float. */
export function add(left: RubyNumeric, right: RubyNumeric): RubyNumeric {
  const value = left.value + right.value;
  return bothIntegers(left, right) ? integer(value) : float(value);
}

/** Ruby `-`, with `add`'s promotion rule. */
export function subtract(left: RubyNumeric, right: RubyNumeric): RubyNumeric {
  const value = left.value - right.value;
  return bothIntegers(left, right) ? integer(value) : float(value);
}

/** Ruby `*`, with `add`'s promotion rule. */
export function multiply(left: RubyNumeric, right: RubyNumeric): RubyNumeric {
  const value = left.value * right.value;
  return bothIntegers(left, right) ? integer(value) : float(value);
}

/** Ruby unary `-`: the kind is kept (`-0` is `0` for an Integer, `-0.0` for a Float). */
export function negate(operand: RubyNumeric): RubyNumeric {
  return operand.kind === "integer" ? integer(-operand.value) : float(-operand.value);
}

/**
 * Ruby: `Evaluator#divide` — `raise DivisionByZeroError if divisor.zero?`,
 * then `dividend / divisor.to_f`, so the result is always a Float (`6/3` is
 * `2.0`). `zero?` is true for `0`, `0.0` and `-0.0`, never for `NaN`.
 */
export function divide(dividend: RubyNumeric, divisor: RubyNumeric): RubyNumeric {
  if (divisor.value === 0) throw new DivisionByZeroError();
  return float(dividend.value / divisor.value);
}

/**
 * C's `pow()`, which Ruby's `**` calls for every Float case. JavaScript's
 * `**` is used only for the special values (zeros, infinities, `NaN`), where
 * ECMAScript and C agree except in two places, handled first: `pow(1, y)` is
 * `1` for every `y` (JS: `1 ** NaN` is `NaN`), and `pow(-1, ±Infinity)` is
 * `1` (JS: `NaN`). Every finite, non-zero case goes through
 * `correctlyRoundedPow` (`pow.ts`), because `**` itself is not correctly
 * rounded and glibc's `pow` is.
 */
function cPow(base: number, exponent: number): number {
  if (exponent === 0 || base === 1) return 1;
  if (base === -1 && (exponent === Infinity || exponent === -Infinity)) return 1;
  if (!Number.isFinite(base) || !Number.isFinite(exponent) || base === 0) return base ** exponent;
  if (base > 0) return correctlyRoundedPow(base, exponent);
  // A negative base only reaches here with an integer-valued exponent (the
  // Complex cases are refused before `cPow` is called).
  const magnitude = correctlyRoundedPow(-base, exponent);
  const odd = Math.abs(exponent) < 2 ** 53 && Math.abs(exponent) % 2 === 1;
  return odd ? -magnitude : magnitude;
}

/**
 * Ruby's test for a negative base promoting `**` to `Complex`: `dy !=
 * round(dy)`. True for a finite non-integer and for `NaN` (which never equals
 * itself); false for an integer-valued exponent and for `±Infinity`
 * (`round(Infinity)` is `Infinity`).
 */
function hasFractionalPart(exponent: number): boolean {
  return Number.isNaN(exponent) || (Number.isFinite(exponent) && !Number.isInteger(exponent));
}

function notReal(): never {
  throw new MathDomainError("result is not a real number");
}

/**
 * Ruby: `Integer#**` (`fix_pow`) for an Integer base and Integer exponent,
 * in the order Ruby checks: `1 ** b` is `1` and `(-1) ** b` is `±1` for EVERY
 * `b`, negative included; any other negative exponent is `0` raising
 * `ZeroDivisionError` (the evaluator's `DivisionByZeroError`) or a Rational
 * (refused); otherwise the exact Integer power, refused beyond the safe range.
 */
function integerPower(base: number, exponent: number): RubyNumeric {
  if (base === 1) return integer(1);
  if (base === -1) return integer(exponent % 2 === 0 ? 1 : -1);
  if (exponent < 0) {
    if (base === 0) throw new DivisionByZeroError();
    return rationalResult();
  }
  if (exponent === 0) return integer(1);
  if (base === 0) return integer(0);
  // |base| >= 2 here, so an exponent of 53 or more cannot stay in range;
  // refuse before computing a power that could be arbitrarily large.
  if (exponent >= 53) return unrepresentableInteger();
  const exact = BigInt(base) ** BigInt(exponent);
  if (exact > BigInt(Number.MAX_SAFE_INTEGER) || exact < BigInt(Number.MIN_SAFE_INTEGER)) {
    return unrepresentableInteger();
  }
  return integer(Number(exact));
}

/**
 * Ruby: `Integer#**` (`fix_pow`) for an Integer base and Float exponent:
 * a zero exponent is `1.0`; a zero base is `Infinity` for a negative
 * exponent and `0.0` otherwise (`NaN` included); a base of `1` is `1.0`; a
 * negative base with a fractional (or `NaN`) exponent is `Complex`.
 */
function integerBaseFloatPower(base: number, exponent: number): RubyNumeric {
  if (exponent === 0) return float(1);
  if (base === 0) return float(exponent < 0 ? Infinity : 0);
  if (base === 1) return float(1);
  if (base < 0 && hasFractionalPart(exponent)) return notReal();
  return float(cPow(base, exponent));
}

/**
 * Ruby: `Float#**` (`rb_float_pow`). The Integer exponent `2` is `dx * dx`,
 * not `pow()`; any other Integer exponent always gives a real Float; a Float
 * exponent gives `Complex` for a negative base with a fractional (or `NaN`)
 * exponent — `(-1.0)**Infinity` is `1.0`, `(-2.0) ** -Infinity` is `0.0`,
 * `(-Infinity) ** 0.5` is `Complex`.
 */
function floatBasePower(base: number, exponent: RubyNumeric): RubyNumeric {
  if (exponent.kind === "integer" && exponent.value === 2) return float(base * base);
  if (exponent.kind === "float" && base < 0 && hasFractionalPart(exponent.value)) {
    return notReal();
  }
  return float(cPow(base, exponent.value));
}

/**
 * Ruby: `Evaluator#power` — `real_result(base**exponent)`. The kind of each
 * operand picks Ruby's `**` implementation; a `Complex` result is the
 * `MathDomainError` `real_result` raises.
 */
export function power(base: RubyNumeric, exponent: RubyNumeric): RubyNumeric {
  if (base.kind === "integer") {
    return exponent.kind === "integer"
      ? integerPower(base.value, exponent.value)
      : integerBaseFloatPower(base.value, exponent.value);
  }
  return floatBasePower(base.value, exponent);
}
