/**
 * Ruby's numeric tower, as far as this slice's arithmetic reaches it.
 *
 * The gem computes with Ruby `Integer`, `Rational` and `Float` values and
 * Ruby's own arithmetic (`numeric.c`, `bignum.c`, `rational.c`): `2+3` is the
 * Integer `5`, `6/3` is the Float `2.0`, `2^100` is an exact Integer and
 * `2^(-1)` the exact Rational `(1/2)`, and evaluation carries on with those
 * exact values — `2^100/2^99` is `2.0`, `2^(-1)*2.0` is `1.0`. This module
 * mirrors that: an Integer is a `bigint`, a Rational an exact reduced
 * `bigint` pair, a Float a `number`, and every operator follows Ruby's
 * promotion and conversion rules for each pair of kinds, read from the Ruby
 * 4.0.1 sources the pinned oracle runs on and measured against it
 * (`test/evaluation/evaluate.spec.ts`'s fixtures check the kind of every
 * row).
 *
 * The public result is a `number` (`index.ts`'s `evaluate`). Only the FINAL
 * value decides whether that is possible: a final Rational, or a final Integer
 * outside `Number.isSafeInteger`, is refused with `UnsupportedFeatureError`
 * (`finalResult`); an intermediate one is carried exactly, so an evaluation
 * error Ruby raises later in the expression still wins.
 * `TODO.plan/open-decisions.md`'s "Evaluation return type" has the decision.
 *
 * Two further refusals are port limits, not Ruby answers, and are recorded in
 * `TODO.plan/deferred.md`:
 *
 * - Where Ruby itself raises a non-evaluation error — `ArgumentError:
 *   exponent is too large`, for an Integer or Rational raised to an Integer
 *   outside the 62-bit Fixnum range, or to a power whose result would exceed
 *   Ruby's 2^34-bit limit — this refuses at the same point, where Ruby's
 *   evaluation stops too.
 * - An Integer longer than `INTEGER_BIT_LIMIT` bits, or a Rational part longer
 *   than `RATIONAL_BIT_LIMIT` bits, is refused as a resource limit: Ruby (with
 *   GMP) keeps going, but V8's `BigInt` takes seconds per operation at that
 *   size and has no fast gcd.
 */

import { UnsupportedFeatureError } from "../core/errors";
import { DivisionByZeroError, MathDomainError } from "./errors";
import { correctlyRoundedPow, ldexp } from "./pow";

/** Ruby's `Integer`, `Rational` or `Float`. */
export type RubyKind = "integer" | "rational" | "float";

/** A value and the Ruby class it has. A Rational is always reduced, with a positive denominator. */
export type RubyNumeric =
  | { readonly kind: "integer"; readonly value: bigint }
  | { readonly kind: "rational"; readonly num: bigint; readonly den: bigint }
  | { readonly kind: "float"; readonly value: number };

/** The value `evaluate` returns, with the kind Ruby's answer had. */
export interface FinalNumeric {
  readonly value: number;
  readonly kind: "integer" | "float";
}

type IntegerValue = Extract<RubyNumeric, { kind: "integer" }>;
type RationalValue = Extract<RubyNumeric, { kind: "rational" }>;
type Exact = IntegerValue | RationalValue;

/** The `feature` identifier every refusal from this module carries. */
const FEATURE = "evaluate";

/** Port resource limits (module header). */
const INTEGER_BIT_LIMIT = 1 << 22;
const RATIONAL_BIT_LIMIT = 1 << 16;

/** Ruby's Fixnum range on 64-bit platforms; `Integer#**` and `Integer#fdiv` branch on it. */
const FIXNUM_MIN = -(1n << 62n);
const FIXNUM_MAX = (1n << 62n) - 1n;

function refuse(detail: string): never {
  throw new UnsupportedFeatureError(FEATURE, detail);
}

function exponentTooLarge(): never {
  return refuse(
    "Ruby raises ArgumentError (exponent is too large) here, which is not an evaluation error",
  );
}

function tooLarge(): never {
  return refuse(
    "an exact intermediate value exceeds this port's size limit " +
      `(${INTEGER_BIT_LIMIT} bits for an Integer, ${RATIONAL_BIT_LIMIT} for a Rational part)`,
  );
}

/** Bit length of `|value|` (`0` for `0n`). */
export function bitLength(value: bigint): number {
  const magnitude = value < 0n ? -value : value;
  if (magnitude === 0n) return 0;
  const hex = magnitude.toString(16);
  return (hex.length - 1) * 4 + (32 - Math.clz32(Number.parseInt(hex.charAt(0), 16)));
}

function isFixnum(value: bigint): boolean {
  return value >= FIXNUM_MIN && value <= FIXNUM_MAX;
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

/** A Ruby Integer. */
export function integer(value: bigint): IntegerValue {
  if (bitLength(value) > INTEGER_BIT_LIMIT) tooLarge();
  return { kind: "integer", value };
}

/**
 * A Ruby Rational — `nurat_canonicalize` then `nurat_reduce`: a zero
 * denominator raises `ZeroDivisionError` (the evaluator's
 * `DivisionByZeroError`), a negative one moves its sign to the numerator.
 * A Rational stays a Rational even with denominator `1` (Ruby: `2**-1 * 2`
 * is `(1/1)`).
 */
export function rational(num: bigint, den: bigint): RationalValue {
  if (den === 0n) throw new DivisionByZeroError();
  if (bitLength(num) > 2 * RATIONAL_BIT_LIMIT || bitLength(den) > 2 * RATIONAL_BIT_LIMIT) {
    tooLarge();
  }
  let n = den < 0n ? -num : num;
  let d = abs(den);
  const g = gcd(n, d);
  if (g > 1n) {
    n /= g;
    d /= g;
  }
  if (bitLength(n) > RATIONAL_BIT_LIMIT || bitLength(d) > RATIONAL_BIT_LIMIT) tooLarge();
  return { kind: "rational", num: n, den: d };
}

/** A Ruby Float — any IEEE-754 double, `-0.0`, `NaN` and the infinities included. */
export function float(value: number): RubyNumeric {
  return { kind: "float", value };
}

/**
 * The kind a JS `number` binding stands for. JavaScript cannot tell `2` from
 * `2.0`, so a safe-integer value is taken as the Ruby Integer a caller writing
 * `2` most likely means, and every other value (fractions, `-0`, `NaN`, the
 * infinities, integers beyond the safe range) as a Float.
 */
export function fromBinding(value: number): RubyNumeric {
  return Number.isSafeInteger(value) && !Object.is(value, -0)
    ? integer(BigInt(value))
    : float(value);
}

/**
 * `bignum.c`'s `big_fdiv_int` and `big_fdiv`, with the 32-bit `BDIGIT`s Ruby
 * uses on x86_64 Linux (`DBL_BIGDIG` = 2): the divisor is truncated to its
 * top 64 bits and the dividend to its top 128–160 bits (shifts floor, like
 * Ruby's two's-complement `big_rshift`), the quotient truncates toward zero
 * (`bigdivrem`), converts to a double correctly rounded (`big2dbl`), and
 * `ldexp` scales it back.
 */
function bigFdivInt(x: bigint, y: bigint): number {
  const ey = bitLength(y) - 64;
  const yShifted = ey > 0 ? y >> BigInt(ey) : y << BigInt(-ey);
  let ex = bitLength(x) - 128;
  if (ex > 32) ex -= 32;
  else if (ex > 0) ex = 0;
  const xShifted = ex > 0 ? x >> BigInt(ex) : x << BigInt(-ex);
  return ldexp(Number(xShifted / yShifted), ex - ey);
}

/**
 * `Rational#to_f` — `rb_int_fdiv_double(num, den)` on the reduced parts: a
 * Fixnum numerator over a Fixnum denominator below 2^53 is `(double)num /
 * (double)den`, as is a Bignum numerator over a Fixnum denominator when the
 * numerator converts to a finite double; every other case is `bigFdivInt`.
 * Neither is guaranteed to be the correctly rounded quotient; this reproduces
 * both exactly.
 */
function rationalToDouble(num: bigint, den: bigint): number {
  if (isFixnum(num)) {
    if (den < 1n << 53n) return Number(num) / Number(den);
    return bigFdivInt(num, den);
  }
  if (isFixnum(den)) {
    const dx = Number(num);
    if (Number.isFinite(dx)) return dx / Number(den);
  }
  return bigFdivInt(num, den);
}

/**
 * The Float an operand becomes when it meets a Float: `Integer#to_f` (a
 * Fixnum by C cast, a Bignum by `big2dbl`; both round to nearest, ties to
 * even, as `Number(bigint)` does, and a Bignum beyond the double range is
 * `Infinity`), `Rational#to_f`, or the Float itself.
 */
function toDouble(x: RubyNumeric): number {
  switch (x.kind) {
    case "integer":
      return Number(x.value);
    case "rational":
      return rationalToDouble(x.num, x.den);
    case "float":
      return x.value;
  }
}

function isExact(x: RubyNumeric): x is Exact {
  return x.kind !== "float";
}

/** Numerator and denominator of an exact value. */
function parts(x: Exact): readonly [bigint, bigint] {
  return x.kind === "integer" ? [x.value, 1n] : [x.num, x.den];
}

/**
 * Ruby `+`: Integer + Integer is an Integer; an Integer or Rational with a
 * Rational is an exact Rational (the Integer coerced to `Rational(n, 1)`);
 * anything with a Float converts the other operand with `toDouble` first.
 */
export function add(left: RubyNumeric, right: RubyNumeric): RubyNumeric {
  if (left.kind === "integer" && right.kind === "integer") return integer(left.value + right.value);
  if (!isExact(left) || !isExact(right)) return float(toDouble(left) + toDouble(right));
  const [an, ad] = parts(left);
  const [bn, bd] = parts(right);
  return rational(an * bd + bn * ad, ad * bd);
}

/** Ruby `-`, with `add`'s promotion rules. */
export function subtract(left: RubyNumeric, right: RubyNumeric): RubyNumeric {
  if (left.kind === "integer" && right.kind === "integer") return integer(left.value - right.value);
  if (!isExact(left) || !isExact(right)) return float(toDouble(left) - toDouble(right));
  const [an, ad] = parts(left);
  const [bn, bd] = parts(right);
  return rational(an * bd - bn * ad, ad * bd);
}

/** Ruby `*`, with `add`'s promotion rules. */
export function multiply(left: RubyNumeric, right: RubyNumeric): RubyNumeric {
  if (left.kind === "integer" && right.kind === "integer") return integer(left.value * right.value);
  if (!isExact(left) || !isExact(right)) return float(toDouble(left) * toDouble(right));
  const [an, ad] = parts(left);
  const [bn, bd] = parts(right);
  return rational(an * bn, ad * bd);
}

/** Ruby unary `-`: the kind is kept (an Integer has no `-0`; a Float keeps `-0.0`). */
export function negate(operand: RubyNumeric): RubyNumeric {
  switch (operand.kind) {
    case "integer":
      return integer(-operand.value);
    case "rational":
      return rational(-operand.num, operand.den);
    case "float":
      return float(-operand.value);
  }
}

function isZero(x: RubyNumeric): boolean {
  switch (x.kind) {
    case "integer":
      return x.value === 0n;
    case "rational":
      return x.num === 0n;
    case "float":
      return x.value === 0;
  }
}

/**
 * Ruby: `Evaluator#divide` — `raise DivisionByZeroError if divisor.zero?`,
 * then `dividend / divisor.to_f`: both sides become Floats, each by its own
 * class's conversion (`2^100/2^99` is `2.0`). `zero?` is true for `0`, `0.0`
 * and `-0.0`, never for `NaN`.
 */
export function divide(dividend: RubyNumeric, divisor: RubyNumeric): RubyNumeric {
  if (isZero(divisor)) throw new DivisionByZeroError();
  return float(toDouble(dividend) / toDouble(divisor));
}

/**
 * C's `pow()`, which Ruby's `**` calls for every Float case. JavaScript's
 * `**` is used only for the special values (zeros, infinities, `NaN`), where
 * ECMAScript and C agree except in two places, handled first: `pow(1, y)` is
 * `1` for every `y` (JS: `1 ** NaN` is `NaN`), and `pow(-1, ±Infinity)` is
 * `1` (JS: `NaN`). Every finite, non-zero case goes through
 * `correctlyRoundedPow` (`pow.ts`), because `**` itself does not match glibc.
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
 * round(dy)` (`Integer#**`, `Float#**`), and the same fractional-part test
 * `rb_dbl_complex_new_polar_pi` makes for a negative Bignum base. True for a
 * finite non-integer and for `NaN`; false for an integer and for `±Infinity`.
 */
function hasFractionalPart(exponent: number): boolean {
  return Number.isNaN(exponent) || (Number.isFinite(exponent) && !Number.isInteger(exponent));
}

function notReal(): never {
  throw new MathDomainError("result is not a real number");
}

/**
 * `base ** exponent` for Integers with `|base| >= 2` and a positive Fixnum
 * exponent, exactly — refused before computing when the result cannot stay
 * within `INTEGER_BIT_LIMIT` (which also covers every case where Ruby raises
 * `ArgumentError` for exceeding its own 2^34-bit limit).
 */
function exactPower(base: bigint, exponent: bigint): bigint {
  if (BigInt(bitLength(base) - 1) * exponent > BigInt(INTEGER_BIT_LIMIT)) tooLarge();
  return integer(base ** exponent).value;
}

/**
 * Ruby: `Integer#**` with an Integer exponent (`fix_pow`, `rb_big_pow`), in
 * Ruby's order. A Fixnum base: `1 ** b` is `1` and `(-1) ** b` is `±1` for
 * EVERY `b`; a negative exponent is `ZeroDivisionError` for `0` and the
 * Rational `1/(a ** -b)` otherwise; then `a == 0` with a Bignum exponent is
 * `0`, and any other Bignum exponent is `ArgumentError`; then `b == 0`,
 * `b == 1`, `a == 0`. A Bignum base: a Bignum exponent is `ArgumentError`,
 * then `b == 0`, `b == 1`, and a negative exponent as above.
 */
function integerPower(base: bigint, exponent: bigint): RubyNumeric {
  if (isFixnum(base)) {
    if (base === 1n) return integer(1n);
    if (base === -1n) return integer(exponent % 2n === 0n ? 1n : -1n);
    if (exponent < 0n) {
      if (base === 0n) throw new DivisionByZeroError();
      // `-b` of the smallest Fixnum is a Bignum: Ruby's `ArgumentError`.
      if (!isFixnum(-exponent)) exponentTooLarge();
      return rational(1n, exactPower(base, -exponent));
    }
    if (!isFixnum(exponent)) {
      if (base === 0n) return integer(0n);
      exponentTooLarge();
    }
    if (exponent === 0n) return integer(1n);
    if (exponent === 1n) return integer(base);
    if (base === 0n) return integer(0n);
    return integer(exactPower(base, exponent));
  }
  if (!isFixnum(exponent)) exponentTooLarge();
  if (exponent === 0n) return integer(1n);
  if (exponent === 1n) return integer(base);
  if (exponent < 0n) {
    if (!isFixnum(-exponent)) exponentTooLarge();
    return rational(1n, exactPower(base, -exponent));
  }
  return integer(exactPower(base, exponent));
}

/**
 * Ruby: `Integer#**` with a Float exponent. A Fixnum base (`fix_pow`): a zero
 * exponent is `1.0`; a zero base is `Infinity` for a negative exponent and
 * `0.0` otherwise (`NaN` included); a base of `1` is `1.0`. Either base: a
 * negative base with a fractional (or `NaN`) exponent is `Complex`;
 * otherwise `pow((double)base, exponent)`.
 */
function integerBaseFloatPower(base: bigint, exponent: number): RubyNumeric {
  if (isFixnum(base)) {
    if (exponent === 0) return float(1);
    if (base === 0n) return float(exponent < 0 ? Infinity : 0);
    if (base === 1n) return float(1);
  }
  if (base < 0n && hasFractionalPart(exponent)) return notReal();
  return float(cPow(Number(base), exponent));
}

/**
 * Ruby: `Float#**` (`rb_float_pow`). The Integer exponent `2` is `dx * dx`;
 * any other Integer exponent converts to a double and always gives a real
 * Float; a Float exponent — or a Rational one, coerced with `to_f` — gives
 * `Complex` for a negative base with a fractional (or `NaN`) exponent:
 * `(-1.0)**Infinity` is `1.0`, `(-2.0) ** -Infinity` is `0.0`,
 * `(-Infinity) ** 0.5` is `Complex`.
 */
function floatBasePower(base: number, exponent: RubyNumeric): RubyNumeric {
  if (exponent.kind === "integer") {
    if (exponent.value === 2n) return float(base * base);
    return float(cPow(base, Number(exponent.value)));
  }
  const dy = toDouble(exponent);
  if (base < 0 && hasFractionalPart(dy)) return notReal();
  return float(cPow(base, dy));
}

function isNegative(x: Exact): boolean {
  return x.kind === "integer" ? x.value < 0n : x.num < 0n;
}

/**
 * Ruby: `Rational#**` (`rb_rational_pow`), also reached by an Integer base
 * with a Rational exponent (coerced to `Rational(base, 1)`). An exact zero
 * exponent gives `(1/1)`; a Rational exponent with denominator `1` is taken
 * as its Integer numerator; with an exact exponent and an integral base, `1`
 * gives `(1/1)`, `-1` gives `(±1/1)` (Integer exponent only), and `0` gives
 * `(0/1)`, or `ZeroDivisionError` for a negative exponent. A Fixnum exponent
 * then raises numerator and denominator exactly; a Bignum one is
 * `ArgumentError`; a Float or non-integral Rational exponent goes through
 * `Float#**` on `self.to_f`.
 */
function rationalBasePower(num: bigint, den: bigint, exponent: RubyNumeric): RubyNumeric {
  let power = exponent;
  if (isExact(power) && isZero(power)) return rational(1n, 1n);
  if (power.kind === "rational" && power.den === 1n) power = integer(power.num);
  if (isExact(power) && den === 1n) {
    if (num === 1n) return rational(1n, 1n);
    if (num === -1n && power.kind === "integer") {
      return rational(power.value % 2n === 0n ? 1n : -1n, 1n);
    }
    if (num === 0n) {
      if (isNegative(power)) throw new DivisionByZeroError();
      return rational(0n, 1n);
    }
  }
  if (power.kind === "integer") {
    if (!isFixnum(power.value)) exponentTooLarge();
    const e = power.value;
    // A positive Fixnum exponent keeps an Integer base an Integer.
    const raise = (b: bigint, n: bigint): bigint => (integerPower(b, n) as IntegerValue).value;
    if (e > 0n) return rational(raise(num, e), raise(den, e));
    return rational(raise(den, -e), raise(num, -e));
  }
  return floatBasePower(rationalToDouble(num, den), power);
}

/**
 * Ruby: `Evaluator#power` — `real_result(base**exponent)`. The kinds of the
 * operands pick Ruby's `**` implementation; a `Complex` result is the
 * `MathDomainError` `real_result` raises.
 */
export function power(base: RubyNumeric, exponent: RubyNumeric): RubyNumeric {
  switch (base.kind) {
    case "integer":
      if (exponent.kind === "integer") return integerPower(base.value, exponent.value);
      if (exponent.kind === "float") return integerBaseFloatPower(base.value, exponent.value);
      return rationalBasePower(base.value, 1n, exponent);
    case "rational":
      return rationalBasePower(base.num, base.den, exponent);
    case "float":
      return floatBasePower(base.value, exponent);
  }
}

/**
 * The evaluator's final value as a JS `number`, after the gem's own finite
 * check (`nonFinite`; an Integer or Rational is always finite): a Rational, or
 * an Integer outside `Number.isSafeInteger`, has no exact JS `number` and is
 * refused.
 */
export function finalResult(result: RubyNumeric, nonFinite: () => never): FinalNumeric {
  switch (result.kind) {
    case "float":
      if (!Number.isFinite(result.value)) nonFinite();
      return { value: result.value, kind: "float" };
    case "integer":
      if (abs(result.value) > BigInt(Number.MAX_SAFE_INTEGER)) {
        return refuse(
          "the result is a Ruby Integer outside JavaScript's safe-integer range " +
            "(Number.MAX_SAFE_INTEGER), which a JS number cannot hold exactly",
        );
      }
      return { value: Number(result.value), kind: "integer" };
    case "rational":
      return refuse(
        `the result is the Ruby Rational (${result.num}/${result.den}), which a JS number ` +
          "cannot hold exactly",
      );
  }
}
