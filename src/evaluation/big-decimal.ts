/**
 * Ruby's `BigDecimal`, as far as the gem's guarded evaluation reaches it
 * (`evaluator.rb`'s `guard_digit_value` and the arithmetic its results flow
 * into): the bigdecimal 4.1.3 gem the pinned oracle's lockfile resolves, with
 * the C extension (`ext/bigdecimal/bigdecimal.c`) for the primitives and
 * `lib/bigdecimal.rb` for `sqrt` and `**`.
 *
 * The C extension keeps a value as base-10^9 words, but every primitive the
 * guarded paths call rounds an exactly computed result, so a value is held
 * here as `sign * coefficient * 10^scale` with an exact `bigint` coefficient,
 * and the words appear only where they change an answer:
 *
 * - `mult`, `add`, `sub` with a digit count compute the exact result and
 *   round it to that many significant digits (`VpLeftRound`); `div` with a
 *   digit count keeps the truncated quotient and the remainder's sign
 *   (`BigDecimal_div2`), which rounds the same way. Without a digit count,
 *   `+`, `-` and `*` are exact (`BigDecimal.limit` is `0`), and `/` rounds
 *   to `max(a.precision, b.precision) + 16` digits, at least 32.
 * - The rounding mode is the default, `ROUND_HALF_UP` (measured:
 *   `BigDecimal.mode(BigDecimal::ROUND_MODE)` is `3`): a dropped first digit
 *   of 5 or more rounds the magnitude up (`VpMidRound`).
 * - The exception mode is the default, none (measured:
 *   `BigDecimal.mode(BigDecimal::EXCEPTION_ALL)` is `0`): an overflow or a
 *   `0/0` gives `Infinity` or `NaN` instead of raising.
 * - A Rational operand is converted to the other operand's word count times
 *   nine digits, at least 32 (`GetCoercePrec`), so `wordCount` reproduces
 *   the C extension's word layout; a Float operand keeps the first 16 digits
 *   of its shortest representation, truncated (`rb_float_convert_to_BigDecimal`
 *   with `digs == 0`); an Integer is exact.
 *
 * `test/evaluation/big-decimal.spec.ts` checks these primitives against the
 * oracle's own answers.
 */

import { UnsupportedFeatureError } from "../core/errors";
import { DivisionByZeroError, NonFiniteResultError } from "./errors";

/** A Ruby `BigDecimal`. `coefficient` has no trailing zeros, and is `0n` (with `scale` `0`) for a zero. */
export interface BigDecimal {
  readonly kind: "decimal";
  readonly special: "finite" | "nan" | "infinity";
  readonly sign: 1 | -1;
  readonly coefficient: bigint;
  readonly scale: number;
}

/** `BigDecimal::Internal::EXTRA_PREC` and `BigDecimal.double_fig`. */
export const EXTRA_PREC = 16;
export const DOUBLE_FIG = 16;
const BASE_FIG = 9;

/**
 * The most digits an exact intermediate may have: `numeric.ts`'s
 * `INTEGER_BIT_LIMIT` (2^22 bits) in decimal digits. Ruby keeps going (an
 * exact `exp(10^19) + 1` asks for some 10^19 digits), this port refuses as
 * it does for an Integer past its limit.
 */
export const DIGIT_LIMIT = Math.floor((1 << 22) * Math.log10(2));

/**
 * The C extension's exponent is a 64-bit word count, so an exponent past
 * `2^63 / 9` words overflows to `Infinity` there (`AddExponent`). A JS number
 * holds the exponent exactly only to `Number.MAX_SAFE_INTEGER`, so a value
 * whose exponent goes past that is refused rather than given a rounded
 * exponent (measured: `exp(6959617540149615310)` to one digit is
 * `0.2e3022523493844061107`).
 */
function checkExponent(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new UnsupportedFeatureError(
      "evaluate",
      "a BigDecimal exponent beyond Number.MAX_SAFE_INTEGER, which this port cannot hold exactly",
    );
  }
}

function checkDigits(digits: number): void {
  if (digits > DIGIT_LIMIT) {
    throw new UnsupportedFeatureError(
      "evaluate",
      `an exact BigDecimal intermediate exceeds this port's size limit (${DIGIT_LIMIT} digits)`,
    );
  }
}

const NAN: BigDecimal = { kind: "decimal", special: "nan", sign: 1, coefficient: 0n, scale: 0 };

function infinity(sign: 1 | -1): BigDecimal {
  return { kind: "decimal", special: "infinity", sign, coefficient: 0n, scale: 0 };
}

function zero(sign: 1 | -1 = 1): BigDecimal {
  return { kind: "decimal", special: "finite", sign, coefficient: 0n, scale: 0 };
}

export const NAN_DECIMAL = NAN;
export const POSITIVE_INFINITY = infinity(1);
export const NEGATIVE_INFINITY = infinity(-1);

/** `sign * coefficient * 10^scale`, with the coefficient's trailing zeros moved into the scale. */
function make(sign: 1 | -1, coefficient: bigint, scale: number): BigDecimal {
  if (coefficient === 0n) return zero(sign);
  checkExponent(scale);
  let c = coefficient;
  let s = scale;
  if (c % 10n === 0n) {
    const digits = c.toString();
    const trimmed = digits.replace(/0+$/, "");
    s += digits.length - trimmed.length;
    c = BigInt(trimmed);
  }
  return { kind: "decimal", special: "finite", sign, coefficient: c, scale: s };
}

function digitCount(c: bigint): number {
  return c === 0n ? 0 : c.toString().length;
}

const POWERS: bigint[] = [];
function pow10(n: number): bigint {
  if (n < 64) {
    let cached = POWERS[n];
    if (cached === undefined) {
      cached = 10n ** BigInt(n);
      POWERS[n] = cached;
    }
    return cached;
  }
  return 10n ** BigInt(n);
}

function floorDivNumber(a: number, b: number): number {
  return Math.floor(a / b);
}

export function isNotNumber(x: BigDecimal): boolean {
  return x.special === "nan";
}

export function isInfinite(x: BigDecimal): boolean {
  return x.special === "infinity";
}

export function isFiniteDecimal(x: BigDecimal): boolean {
  return x.special === "finite";
}

export function isZero(x: BigDecimal): boolean {
  return x.special === "finite" && x.coefficient === 0n;
}

/** `BigDecimal#exponent`: the power of ten of `0.d1d2...`; `0` for a zero and the special values. */
export function exponent(x: BigDecimal): number {
  if (x.special !== "finite" || x.coefficient === 0n) return 0;
  return digitCount(x.coefficient) + x.scale;
}

/** `BigDecimal#n_significant_digits`. */
export function significantDigits(x: BigDecimal): number {
  return x.special === "finite" ? digitCount(x.coefficient) : 0;
}

/**
 * `BigDecimal#precision` (`VpCountPrecisionAndScale`): the significant digits
 * plus the zeros between them and the decimal point.
 */
export function precision(x: BigDecimal): number {
  if (x.special !== "finite" || x.coefficient === 0n) return 0;
  const n = digitCount(x.coefficient);
  const e = n + x.scale;
  return e > 0 ? Math.max(n, e) : n - e;
}

/**
 * The C extension's `Prec`: the base-10^9 words from the first nonzero word
 * to the last, for a normalized value (`VpNmlz`). A zero has one word.
 */
export function wordCount(x: BigDecimal): number {
  if (x.special !== "finite" || x.coefficient === 0n) return 1;
  const n = digitCount(x.coefficient);
  const e = n + x.scale;
  const firstWord = floorDivNumber(e - 1, BASE_FIG) + 1;
  return firstWord - floorDivNumber(e - n, BASE_FIG);
}

/** `GetCoercePrec(a, prec)`: the digits a Rational operand is converted to. */
export function coercePrecision(x: BigDecimal, prec = 0): number {
  const digits = prec === 0 ? wordCount(x) * BASE_FIG : prec;
  return Math.max(digits, 2 * DOUBLE_FIG);
}

/** `BigDecimal(integer)`: exact. */
export function fromInteger(value: bigint): BigDecimal {
  return value < 0n ? make(-1, -value, 0) : make(1, value, 0);
}

/**
 * `BigDecimal(float, 0)` (`rb_float_convert_to_BigDecimal`): the shortest
 * digits that round-trip (`BigDecimal_dtoa` mode 0, which JavaScript's own
 * shortest representation matches), truncated to 16 (`len10 >
 * BIGDECIMAL_DOUBLE_FIGURES`, "TODO: Presumably, rounding should be done
 * here"). `0.30000000000000004` becomes `0.3`.
 */
export function fromFloat(value: number): BigDecimal {
  if (Number.isNaN(value)) return NAN;
  if (value === Infinity) return POSITIVE_INFINITY;
  if (value === -Infinity) return NEGATIVE_INFINITY;
  if (value === 0) return zero(Object.is(value, -0) ? -1 : 1);
  const [mantissa, exp] = Math.abs(value).toExponential().split("e") as [string, string];
  let digits = mantissa.replace(".", "");
  if (digits.length > DOUBLE_FIG) digits = digits.slice(0, DOUBLE_FIG);
  const scale = Number(exp) - (digits.length - 1);
  return make(value < 0 ? -1 : 1, BigInt(digits), scale);
}

/** `BigDecimal(rational, digits)` (`rb_rational_convert_to_BigDecimal`): `num.div(den, digits)`. */
export function fromRational(num: bigint, den: bigint, digits: number): BigDecimal {
  return div(fromInteger(num), fromInteger(den), digits);
}

/** Rounds the magnitude half up to `digits` significant digits (`VpLeftRound`, `ROUND_HALF_UP`). */
function roundTo(sign: 1 | -1, coefficient: bigint, scale: number, digits: number): BigDecimal {
  const n = digitCount(coefficient);
  if (digits <= 0 || n <= digits) return make(sign, coefficient, scale);
  const drop = n - digits;
  const divisor = pow10(drop);
  let kept = coefficient / divisor;
  const rest = coefficient % divisor;
  if (rest * 2n >= divisor) kept += 1n;
  return make(sign, kept, scale + drop);
}

/** Rounds a finite value to `digits` significant digits; `0` leaves it exact. */
export function round(x: BigDecimal, digits: number): BigDecimal {
  if (x.special !== "finite" || digits === 0) return x;
  return roundTo(x.sign, x.coefficient, x.scale, digits);
}

function signed(x: BigDecimal): bigint {
  return x.sign < 0 ? -x.coefficient : x.coefficient;
}

function fromSigned(value: bigint, scale: number, digits = 0): BigDecimal {
  const sign = value < 0n ? -1 : 1;
  const magnitude = value < 0n ? -value : value;
  return digits > 0 ? roundTo(sign, magnitude, scale, digits) : make(sign, magnitude, scale);
}

/** `a + b`, or `a.add(b, digits)` (`BigDecimal_addsub_with_coerce`). */
export function add(a: BigDecimal, b: BigDecimal, digits = 0): BigDecimal {
  if (a.special === "nan" || b.special === "nan") return NAN;
  if (a.special === "infinity" || b.special === "infinity") {
    if (a.special === "infinity" && b.special === "infinity") return a.sign === b.sign ? a : NAN;
    return a.special === "infinity" ? a : b;
  }
  if (a.coefficient === 0n && b.coefficient === 0n) return zero(a.sign < 0 && b.sign < 0 ? -1 : 1);
  if (a.coefficient === 0n) return round(b, digits);
  if (b.coefficient === 0n) return round(a, digits);
  const scale = Math.min(a.scale, b.scale);
  checkDigits(Math.max(exponent(a), exponent(b)) - scale);
  const sum = signed(a) * pow10(a.scale - scale) + signed(b) * pow10(b.scale - scale);
  if (sum === 0n) return zero();
  return fromSigned(sum, scale, digits);
}

export function negate(x: BigDecimal): BigDecimal {
  if (x.special === "nan") return x;
  return { ...x, sign: x.sign < 0 ? 1 : -1 };
}

/** `a - b`, or `a.sub(b, digits)`. */
export function sub(a: BigDecimal, b: BigDecimal, digits = 0): BigDecimal {
  return add(a, negate(b), digits);
}

/** `a * b`, or `a.mult(b, digits)` (`BigDecimal_mult_with_coerce`). */
export function mult(a: BigDecimal, b: BigDecimal, digits = 0): BigDecimal {
  if (a.special === "nan" || b.special === "nan") return NAN;
  const sign: 1 | -1 = a.sign === b.sign ? 1 : -1;
  if (a.special === "infinity" || b.special === "infinity") {
    if (isZero(a) || isZero(b)) return NAN;
    return infinity(sign);
  }
  if (a.coefficient === 0n || b.coefficient === 0n) return zero(sign);
  checkDigits(digitCount(a.coefficient) + digitCount(b.coefficient));
  const product = a.coefficient * b.coefficient;
  return digits > 0
    ? roundTo(sign, product, a.scale + b.scale, digits)
    : make(sign, product, a.scale + b.scale);
}

/**
 * `a.div(b, digits)` with `digits > 0` (`BigDecimal_div2`): the quotient
 * rounded half up to `digits` significant digits. A zero divisor gives
 * `Infinity` (or `NaN` for `0/0`), as the default exception mode does.
 */
export function div(a: BigDecimal, b: BigDecimal, digits: number): BigDecimal {
  if (a.special === "nan" || b.special === "nan") return NAN;
  const sign: 1 | -1 = a.sign === b.sign ? 1 : -1;
  if (a.special === "infinity") return b.special === "infinity" ? NAN : infinity(sign);
  if (b.special === "infinity") return zero(sign);
  if (b.coefficient === 0n) return a.coefficient === 0n ? NAN : infinity(sign);
  if (a.coefficient === 0n) return zero(sign);
  // Enough quotient digits for `digits` plus one to round on.
  const shift = Math.max(0, digits + 1 - digitCount(a.coefficient) + digitCount(b.coefficient));
  const numerator = a.coefficient * pow10(shift);
  let quotient = numerator / b.coefficient;
  const remainder = numerator % b.coefficient;
  let scale = a.scale - b.scale - shift;
  // A nonzero remainder can only matter below the digit rounded on; keep it
  // as a sticky digit so a quotient that is exactly representable stays exact.
  if (remainder !== 0n) {
    quotient = quotient * 10n + 1n;
    scale -= 1;
  }
  return roundTo(sign, quotient, scale, digits);
}

/** `a / b` (`BigDecimal_div2` with `n == 0`): `max(precision) + 16` digits, at least 32. */
export function quo(a: BigDecimal, b: BigDecimal): BigDecimal {
  const digits = Math.max(Math.max(precision(a), precision(b)) + DOUBLE_FIG, 2 * DOUBLE_FIG);
  return div(a, b, digits);
}

/** `a <=> b` (`BigDecimalCmp`); `null` when either is `NaN`. */
export function compare(a: BigDecimal, b: BigDecimal): -1 | 0 | 1 | null {
  if (a.special === "nan" || b.special === "nan") return null;
  if (a.special === "infinity" || b.special === "infinity") {
    const rank = (x: BigDecimal): number => (x.special === "infinity" ? x.sign : 0);
    const difference = rank(a) - rank(b);
    return difference < 0 ? -1 : difference > 0 ? 1 : 0;
  }
  const difference = sub(a, b);
  return isZero(difference) ? 0 : difference.sign;
}

export function absolute(x: BigDecimal): BigDecimal {
  return x.special === "nan" ? x : { ...x, sign: 1 };
}

/** `x._decimal_shift(n)`: `x * 10^n`, exactly. */
export function decimalShift(x: BigDecimal, n: number): BigDecimal {
  if (x.special !== "finite" || x.coefficient === 0n) return x;
  checkExponent(x.scale + n);
  return { ...x, scale: x.scale + n };
}

/** `x.truncate(n)`: drops every digit after the `n`th behind the decimal point, toward zero. */
export function truncate(x: BigDecimal, n: number): BigDecimal {
  if (x.special !== "finite" || x.coefficient === 0n || x.scale >= -n) return x;
  const drop = -n - x.scale;
  if (drop >= digitCount(x.coefficient)) return zero(x.sign);
  return make(x.sign, x.coefficient / pow10(drop), x.scale + drop);
}

/** `x.fix`: the integer part, as a BigDecimal. */
export function fix(x: BigDecimal): BigDecimal {
  return truncate(x, 0);
}

/** `x.frac`: the fractional part, as a BigDecimal. */
export function frac(x: BigDecimal): BigDecimal {
  if (x.special !== "finite") return x;
  return sub(x, fix(x));
}

function nonFinite(): never {
  throw new NonFiniteResultError();
}

/** `x.to_i`: truncates toward zero; `FloatDomainError` (the evaluator's `NonFiniteResultError`) for `NaN` and the infinities. */
export function toInteger(x: BigDecimal): bigint {
  if (x.special !== "finite") nonFinite();
  const t = fix(x);
  checkDigits(exponent(t));
  return signed(t) * pow10(Math.max(t.scale, 0));
}

/** `x.floor` with no digits: an Integer. */
export function floor(x: BigDecimal): bigint {
  const whole = toInteger(x);
  return x.sign < 0 && !isZero(frac(x)) ? whole - 1n : whole;
}

/** `x.ceil` with no digits: an Integer. */
export function ceil(x: BigDecimal): bigint {
  const whole = toInteger(x);
  return x.sign > 0 && !isZero(frac(x)) ? whole + 1n : whole;
}

/**
 * `a.divmod(b)` (`BigDecimal_DoDivmod`): the quotient rounded toward negative
 * infinity, as an Integer, and `a - q * b`, exactly. A zero divisor raises
 * `ZeroDivisionError` (the evaluator's `DivisionByZeroError`).
 */
export function divmod(a: BigDecimal, b: BigDecimal): [bigint | null, BigDecimal] {
  if (a.special === "nan" || b.special === "nan" || (isInfinite(a) && isInfinite(b))) {
    return [null, NAN];
  }
  if (isZero(b)) throw new DivisionByZeroError();
  if (isInfinite(a)) return [null, NAN];
  if (isZero(a)) return [0n, a];
  if (isInfinite(b)) return a.sign !== b.sign ? [-1n, b] : [0n, a];
  const scale = Math.min(a.scale, b.scale);
  checkDigits(Math.max(exponent(a), exponent(b)) - scale);
  const x = signed(a) * pow10(a.scale - scale);
  const y = signed(b) * pow10(b.scale - scale);
  let q = x / y;
  if (x % y !== 0n && x < 0n !== y < 0n) q -= 1n;
  return [q, sub(a, mult(fromInteger(q), b))];
}

/**
 * `x.to_f` (`BigDecimal_to_f`): the decimal string read by `strtod`, which
 * JavaScript's `Number` matches; below the word exponent `-322` it is `0.0`
 * and above `317` an infinity, decided on the word exponent as the C code
 * does.
 */
export function toFloat(x: BigDecimal): number {
  if (x.special === "nan") return Number.NaN;
  if (x.special === "infinity") return x.sign * Infinity;
  if (x.coefficient === 0n) return x.sign < 0 ? -0 : 0;
  const e = exponent(x);
  const wordExponent = (floorDivNumber(e - 1, BASE_FIG) + 1) * BASE_FIG;
  if (wordExponent > 308 + BASE_FIG) return x.sign * Infinity;
  if (wordExponent < -307 - 15) return x.sign < 0 ? -0 : 0;
  return Number(`${x.sign < 0 ? "-" : ""}${x.coefficient}e${x.scale}`);
}

/** `x.to_r` and `Rational(x)`: exact; `FloatDomainError` for `NaN` and the infinities. */
export function toRational(x: BigDecimal): readonly [bigint, bigint] {
  if (x.special !== "finite") nonFinite();
  checkDigits(Math.max(exponent(x), 0) - Math.min(x.scale, 0));
  if (x.scale >= 0) return [signed(x) * pow10(x.scale), 1n];
  return [signed(x), pow10(-x.scale)];
}

/** `BigDecimal#to_s` and `#inspect`: `0.84147e0`, `-0.0`, `NaN`, `Infinity`. */
export function inspect(x: BigDecimal): string {
  if (x.special === "nan") return "NaN";
  if (x.special === "infinity") return x.sign < 0 ? "-Infinity" : "Infinity";
  const sign = x.sign < 0 ? "-" : "";
  if (x.coefficient === 0n) return `${sign}0.0`;
  return `${sign}0.${x.coefficient}e${exponent(x)}`;
}

/** `BigDecimal::Internal.newton_loop`: the precisions Newton's method steps through, smallest first. */
export function newtonPrecisions(prec: number): number[] {
  const precs: number[] = [];
  let p = prec;
  while (p > DOUBLE_FIG / 2) {
    precs.push(p);
    p = Math.floor((p + 1) / 2) + 2;
  }
  return precs.reverse();
}

/**
 * `BigDecimal#sqrt(prec)` (`lib/bigdecimal.rb`), for `prec > 0`: Newton's
 * method from `Math.sqrt` of the reduced value, at `prec + 16` digits.
 * A negative value raises `FloatDomainError` ("sqrt of negative value"),
 * which the evaluator reports as `NonFiniteResultError`.
 */
export function sqrt(x: BigDecimal, prec: number): BigDecimal {
  if (x.special === "infinity" && x.sign > 0) return x;
  if (compare(x, zero()) === -1) nonFinite();
  if (x.special === "nan") nonFinite();
  if (isZero(x)) return x;
  const ex = Math.floor(exponent(x) / 2);
  const reduced = decimalShift(x, -2 * ex);
  let y = fromFloat(Math.sqrt(toFloat(reduced)));
  const two = fromInteger(2n);
  for (const p of newtonPrecisions(prec + EXTRA_PREC)) {
    y = div(add(y, div(reduced, y, p), p), two, p);
  }
  return mult(decimalShift(y, ex), fromInteger(1n), prec);
}
