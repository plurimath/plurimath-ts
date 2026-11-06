/**
 * Ruby's `BigMath.exp`, `log`, `sin`, `cos`, `atan` and `PI`, and
 * `BigDecimal#**` — the bigdecimal 4.1.3 gem's own algorithms
 * (`lib/bigdecimal.rb`, `lib/bigdecimal/math.rb`), ported step for step on
 * `big-decimal.ts`'s primitives, so each intermediate is rounded where
 * Ruby's is and the last digit comes out as Ruby's does.
 *
 * Why a port and not a correctly rounded library: these algorithms compute
 * to the requested digits plus 16 and round once more at the end, so where
 * the exact value lies within those extra digits of a rounding midpoint the
 * gem's last digit differs from the correctly rounded one. Measured on the
 * oracle: `sqrt(10^40+1)` to 41 digits is `0.10000000000000000000000000000000000000001e21`,
 * where the correctly rounded value is `0.1e21`
 * (`evaluation-fixtures.json`'s `guarded-sqrt-double-rounding-*` rows).
 *
 * The algorithms read a few `Float` values too: `Math.log` for the reduction
 * and the series lengths (`float_log`), `Math.lgamma` for the series lengths,
 * and `Math.atan` and `Math.sqrt` for Newton's first guess. Each is either
 * correctly rounded in both runtimes (`Math.sqrt`) or used only where a
 * last-bit difference cannot change the answer: a first guess Newton's
 * method refines, a reduction whose result is exact whatever the guess, or a
 * series length the next term would not change. `lgamma` has no JavaScript
 * counterpart and is computed as `log((n - 1)!)`.
 */

import {
  add,
  type BigDecimal,
  compare,
  DOUBLE_FIG,
  decimalShift,
  div,
  divmod,
  EXTRA_PREC,
  exponent,
  fix,
  frac,
  fromFloat,
  fromInteger,
  isFiniteDecimal,
  isInfinite,
  isNotNumber,
  isZero,
  mult,
  NAN_DECIMAL,
  NEGATIVE_INFINITY,
  negate,
  newtonPrecisions,
  POSITIVE_INFINITY,
  quo,
  significantDigits,
  sqrt,
  sub,
  toFloat,
  toInteger,
  truncate,
} from "./big-decimal";
import { MathDomainError } from "./errors";

const ZERO = fromInteger(0n);
const ONE = fromInteger(1n);
const TWO = fromInteger(2n);
const MINUS_ONE = fromInteger(-1n);
const LOG10 = Math.log(10);

function lessThan(a: BigDecimal, b: BigDecimal): boolean {
  return compare(a, b) === -1;
}

function greaterThan(a: BigDecimal, b: BigDecimal): boolean {
  return compare(a, b) === 1;
}

/** `BigDecimal::Internal.float_log`: `Math.log` of `x` with its exponent split off. */
function floatLog(x: BigDecimal): number {
  const e = exponent(x);
  return Math.log(toFloat(decimalShift(x, -e))) + e * LOG10;
}

/** `Math.lgamma(n)[0]` for an integer `n >= 1`: `log((n - 1)!)`. */
function logGamma(n: number): number {
  let sum = 0;
  for (let i = 2; i < n; i++) sum += Math.log(i);
  return sum;
}

/**
 * `(1..).bsearch { |k| ... }` for a predicate that turns true once and stays
 * true: Ruby probes `1 + 1, 1 + 2, 1 + 4, ...` until one holds, then searches
 * `[1, that]` for the smallest that does.
 */
function firstTrue(predicate: (k: number) => boolean): number {
  let diff = 1;
  let high = 1 + diff;
  while (!predicate(high)) {
    diff *= 2;
    high = 1 + diff;
  }
  let low = 1;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (predicate(mid)) high = mid;
    else low = mid + 1;
  }
  return low;
}

/**
 * `BigDecimal::Internal.taylor_sum_binary_splitting`:
 * `(x/d0)*(1+(x/d1)*(1+(x/d2)*(1+...)))`, merging adjacent terms pairwise.
 */
function taylorSum(x: BigDecimal, ds: readonly number[], prec: number): BigDecimal {
  let fs: [BigDecimal, BigDecimal][] = ds.map((d) => [ZERO, fromInteger(BigInt(d))]);
  let xn: BigDecimal | null = null;
  while (fs.length > 1) {
    const power: BigDecimal = xn === null ? x : mult(xn, xn, prec);
    xn = power;
    const next: [BigDecimal, BigDecimal][] = [];
    for (let i = 0; i < fs.length; i += 2) {
      const a = fs[i] as [BigDecimal, BigDecimal];
      const b = fs[i + 1] ?? [ZERO, decimalShift(ONE, Math.max(exponent(power), 0) + 2)];
      // `a[0] * b[1]` starts from the Integer `0`: `0 * BigDecimal(d)` keeps d's sign.
      next.push([
        add(mult(a[0], b[1]), mult(power, add(b[0], b[1])), prec),
        mult(a[1], b[1], prec),
      ]);
    }
    fs = next;
  }
  const [numerator, denominator] = fs[0] as [BigDecimal, BigDecimal];
  return div(numerator, denominator, prec);
}

/** `BigMath._exp_binary_splitting`. */
function expBinarySplitting(x: BigDecimal, prec: number): BigDecimal {
  if (isZero(x)) return ONE;
  const logx = floatLog(abs(x));
  const step = firstTrue((k) => logGamma(k + 1) - k * logx > prec * LOG10);
  const ds = Array.from({ length: step }, (_, i) => i + 1);
  return add(ONE, taylorSum(x, ds, prec));
}

function abs(x: BigDecimal): BigDecimal {
  return x.sign < 0 ? negate(x) : x;
}

/** `BigMath.exp(x, prec)`. */
export function exp(x: BigDecimal, prec: number): BigDecimal {
  if (isNotNumber(x)) return NAN_DECIMAL;
  if (isInfinite(x) || exponent(x) >= 21) {
    if (greaterThan(x, ZERO)) return POSITIVE_INFINITY;
    return ZERO;
  }
  if (isZero(x)) return ONE;
  const cnt = lessThan(x, MINUS_ONE) || greaterThan(x, ONE) ? exponent(x) : 0;
  const prec2 = prec + EXTRA_PREC + cnt;
  let rest = mult(decimalShift(x, -cnt), ONE, prec2);
  let n = 2;
  let y = ONE;
  while (!isZero(rest)) {
    const partial = truncate(rest, n);
    rest = sub(rest, partial);
    y = mult(y, expBinarySplitting(partial, prec2), prec2);
    n *= 2;
  }
  for (let i = 0; i < cnt; i++) {
    const y2 = mult(y, y, prec2);
    const y5 = mult(mult(y2, y2, prec2), y, prec2);
    y = mult(y5, y5, prec2);
  }
  return mult(y, ONE, prec);
}

const ONE_POINT_ZERO_ONE = fromFloat(1.01);
const ZERO_POINT_NINE_NINE = fromFloat(0.99);

/**
 * `BigMath.log(x, prec)`. A negative argument raises `Math::DomainError`
 * ("Negative argument for log"), which the evaluator reports as
 * `MathDomainError` with that message; zero gives `-Infinity`.
 */
export function log(x: BigDecimal, prec: number): BigDecimal {
  if (isNotNumber(x)) return NAN_DECIMAL;
  if (lessThan(x, ZERO)) throw new MathDomainError("Negative argument for log");
  if (isZero(x)) return NEGATIVE_INFINITY;
  if (isInfinite(x)) return POSITIVE_INFINITY;
  if (compare(x, ONE) === 0) return ZERO;
  const prec2 = prec + EXTRA_PREC;
  let reduced = x;
  let approximation = ZERO;
  if (greaterThan(x, ONE_POINT_ZERO_ONE) || lessThan(x, ZERO_POINT_NINE_NINE)) {
    approximation = fromFloat(floatLog(x));
    reduced = div(x, exp(approximation, prec2), prec2);
  }
  let y = fromFloat(floatLog(reduced));
  const additional = Math.max(-exponent(sub(reduced, ONE)), 0);
  for (const p of newtonPrecisions(prec2)) {
    const expy = exp(y, p + additional);
    y = sub(y, div(sub(expy, reduced, p), expy, p), p);
  }
  return add(y, approximation, prec);
}

const PI_CACHE = new Map<number, BigDecimal>();

/** `BigMath.PI(prec)`: the Gauss–Legendre iteration. */
export function pi(prec: number): BigDecimal {
  const cached = PI_CACHE.get(prec);
  if (cached !== undefined) return cached;
  const n = prec + EXTRA_PREC;
  let a = ONE;
  let b = sqrt(fromFloat(0.5), n);
  let s = fromFloat(0.25);
  let t = 1n;
  while (compare(a, b) !== 0 && exponent(sub(a, b)) > 1 - n) {
    const c = div(sub(a, b), TWO, n);
    const nextA = div(add(a, b), TWO, n);
    b = sqrt(mult(a, b), n);
    a = nextA;
    s = sub(s, mult(mult(c, c), fromInteger(t)), n);
    t *= 2n;
  }
  const value = div(mult(a, b), s, prec);
  PI_CACHE.set(prec, value);
  return value;
}

const HALF_PI_FLOAT = fromFloat(Math.PI / 2);
const MINUS_HALF_PI_FLOAT = fromFloat(-Math.PI / 2);

/**
 * `BigMath._sin_periodic_reduction`: `x` reduced into `[-pi/2, pi/2]` with
 * the sign the reduction flips, raising pi's precision until the remainder
 * keeps `prec` digits. The Float bounds `Math::PI/2` meet `x` as
 * `BigDecimal(Math::PI/2, 0)`, 16 digits.
 */
function sinPeriodicReduction(
  x: BigDecimal,
  prec: number,
  addHalfPi: boolean,
): [1 | -1, BigDecimal] {
  if (!addHalfPi && compare(MINUS_HALF_PI_FLOAT, x) !== 1 && compare(x, HALF_PI_FLOAT) !== 1) {
    return [1, x];
  }
  let modPrec = prec + EXTRA_PREC;
  const piExtraPrec = Math.max(exponent(x), 0) + EXTRA_PREC;
  for (;;) {
    const p = pi(modPrec + piExtraPrec);
    const halfPi = quo(p, TWO);
    const [quotient, remainder] = divmod(addHalfPi ? add(x, p) : add(x, halfPi), p);
    const mod = sub(remainder, halfPi);
    if (isZero(mod) || modPrec + exponent(mod) <= 0) {
      modPrec = Math.floor((modPrec * 3) / 2) + EXTRA_PREC;
    } else if (modPrec + exponent(mod) < prec) {
      modPrec = prec - exponent(mod) + EXTRA_PREC;
    } else {
      const q = quotient as bigint;
      return [((q % 2n) + 2n) % 2n === 0n ? 1 : -1, mult(mod, ONE, prec)];
    }
  }
}

/** `BigMath._sin_binary_splitting`. */
function sinBinarySplitting(x: BigDecimal, prec: number): BigDecimal {
  if (isZero(x)) return x;
  const x2 = mult(x, x, prec);
  const logx = floatLog(abs(x));
  const step = firstTrue((k) => logGamma(2 * k + 1) - 2 * k * logx > prec * LOG10);
  const ds = Array.from({ length: step }, (_, i) => -(2 * (i + 1)) * (2 * (i + 1) + 1));
  return mult(x, add(ONE, taylorSum(x2, ds, prec)), prec);
}

/** `BigMath._sin_around_zero`: the addition theorem over `x`'s digits, two, four, eight at a time. */
function sinAroundZero(x: BigDecimal, prec: number): BigDecimal {
  let sine = ZERO;
  let cosine = ONE;
  let rest = x;
  let n = 2;
  while (!isZero(rest)) {
    const partial = truncate(rest, n);
    rest = sub(rest, partial);
    const s = sinBinarySplitting(partial, prec);
    const c = sqrt(sub(ONE, mult(s, s)), prec);
    const nextSine = add(mult(sine, c), mult(cosine, s), prec);
    cosine = sub(mult(cosine, c), mult(sine, s), prec);
    sine = nextSine;
    n *= 2;
  }
  if (lessThan(sine, MINUS_ONE)) return MINUS_ONE;
  if (greaterThan(sine, ONE)) return ONE;
  return sine;
}

/** `BigMath.sin(x, prec)`. */
export function sin(x: BigDecimal, prec: number): BigDecimal {
  if (!isFiniteDecimal(x)) return NAN_DECIMAL;
  const n = prec + EXTRA_PREC;
  const [sign, reduced] = sinPeriodicReduction(x, n, false);
  return mult(sinAroundZero(reduced, n), fromInteger(BigInt(sign)), prec);
}

/** `BigMath.cos(x, prec)`. */
export function cos(x: BigDecimal, prec: number): BigDecimal {
  if (!isFiniteDecimal(x)) return NAN_DECIMAL;
  const n = prec + EXTRA_PREC;
  const [sign, reduced] = sinPeriodicReduction(x, n, true);
  return mult(sinAroundZero(reduced, n), fromInteger(BigInt(sign)), prec);
}

/** `BigMath.atan(x, prec)`: Newton's method on `tan(y) - x`, from `Math.atan`. */
export function atan(x: BigDecimal, prec: number): BigDecimal {
  if (isNotNumber(x)) return NAN_DECIMAL;
  const n = prec + EXTRA_PREC;
  if (isInfinite(x)) return div(pi(n), fromInteger(BigInt(2 * x.sign)), prec);
  const negative = lessThan(x, ZERO);
  let value = negative ? negate(x) : x;
  const inverse = lessThan(value, MINUS_ONE) || greaterThan(value, ONE);
  if (inverse) value = div(ONE, value, n);
  let y = fromFloat(Math.atan(toFloat(value)));
  for (const p of newtonPrecisions(n)) {
    const s = sin(y, p);
    const c = sqrt(sub(ONE, mult(s, s)), p);
    y = sub(y, mult(c, sub(s, mult(c, mult(value, ONE, p)), p)), p);
  }
  if (inverse) y = sub(quo(pi(n), TWO), y);
  return mult(y, negative ? MINUS_ONE : ONE, prec);
}

function isOddInteger(y: BigDecimal): boolean {
  const [, remainder] = divmod(y, TWO);
  return compare(remainder, ONE) === 0;
}

/**
 * `BigDecimal#power(y, prec)` (`lib/bigdecimal.rb`), `y` already coerced
 * (`coerce_to_bigdecimal`). With `prec == 0` an integral exponent is exact
 * (`BigDecimal.limit` is `0`), a negative one then divided by `/`; any other
 * exponent goes through `BigMath.exp(BigMath.log(x) * y)` at
 * `max(digits) + 16` digits. A negative base with a fractional exponent
 * raises `Math::DomainError` ("Computation results in complex number").
 */
export function power(x: BigDecimal, y: BigDecimal, prec = 0): BigDecimal {
  if (isNotNumber(x) || isNotNumber(y)) return NAN_DECIMAL;
  if (isZero(y)) return ONE;
  if (isInfinite(y)) {
    if (lessThan(x, ZERO)) {
      if (lessThan(x, MINUS_ONE) && y.sign < 0) return ZERO;
      if (greaterThan(x, MINUS_ONE) && y.sign > 0) return ZERO;
      throw new MathDomainError("Result undefined for negative base raised to infinite power");
    }
    if (lessThan(x, ONE)) return y.sign > 0 ? ZERO : POSITIVE_INFINITY;
    if (compare(x, ONE) === 0) return ONE;
    return y.sign > 0 ? POSITIVE_INFINITY : ZERO;
  }
  if (isInfinite(x) && lessThan(y, ZERO)) {
    const negativeZero = lessThan(x, ZERO) && isZero(frac(y)) && isOddInteger(y);
    return negativeZero ? negate(ZERO) : ZERO;
  }
  if (isZero(x)) {
    if (greaterThan(y, ZERO)) return ZERO;
    if (isZero(frac(y)) && isOddInteger(y) && x.sign < 0) return NEGATIVE_INFINITY;
    return POSITIVE_INFINITY;
  }
  if (lessThan(x, ZERO)) {
    if (!isZero(frac(y))) {
      throw new MathDomainError("Computation results in complex number");
    }
    const magnitude = power(negate(x), y, prec);
    return isOddInteger(y) ? negate(magnitude) : magnitude;
  }
  if (compare(x, ONE) === 0) return ONE;
  const fractional = frac(y);
  if (isZero(fractional) && prec === 0) {
    let remaining = toInteger(fix(y));
    const negativeExponent = remaining < 0n;
    if (negativeExponent) remaining = -remaining;
    let answer = ONE;
    let bit = 1n;
    let xn = x;
    for (;;) {
      if ((remaining & bit) === bit) answer = mult(answer, xn);
      bit <<= 1n;
      if (bit > remaining) break;
      xn = mult(xn, xn);
    }
    return negativeExponent ? quo(ONE, answer) : answer;
  }
  const resultPrec =
    prec !== 0
      ? prec
      : Math.max(significantDigits(x), significantDigits(y), DOUBLE_FIG) + DOUBLE_FIG;
  let prec2 = resultPrec + EXTRA_PREC;
  if (lessThan(y, ZERO)) {
    const inverse = power(x, negate(y), prec2);
    if (isInfinite(inverse)) return ZERO;
    if (isZero(inverse)) return POSITIVE_INFINITY;
    return div(ONE, inverse, resultPrec);
  }
  if (isZero(fractional) && exponent(y) < Math.log(resultPrec) * 5 + 20) {
    const powPrec = prec2 + exponent(y);
    const whole = toInteger(fix(y));
    let bit = 1n;
    let xn = x;
    let answer = ONE;
    for (;;) {
      if ((whole & bit) === bit) answer = mult(answer, xn, powPrec);
      bit <<= 1n;
      if (bit > whole) break;
      xn = mult(xn, xn, powPrec);
    }
    return mult(answer, ONE, resultPrec);
  }
  if (greaterThan(x, ONE) && isFiniteDecimal(x)) {
    const logxExponent = lessThan(x, TWO)
      ? exponent(sub(x, ONE))
      : Math.round(Math.log10(exponent(x)));
    prec2 += Math.max(exponent(y) + logxExponent, 0);
  }
  return exp(mult(log(x, prec2), y, prec2), resultPrec);
}
