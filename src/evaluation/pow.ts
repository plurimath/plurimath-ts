/**
 * `pow(x, y)` for finite, positive `x` and finite, non-zero `y`, standing in
 * for the C library `pow()` that Ruby's `**` calls for every Float case.
 *
 * JavaScript's `**` is not that function: V8 computes it with its own
 * algorithm, which differs from glibc's `pow` — what the oracle's Ruby calls —
 * for about 5% of ordinary inputs (measured: 4,825 of 100,000 random pairs,
 * checked against Python, which calls the same `pow`; `4^0.5^(-2.5)` is
 * `0.1767766952966369` in Ruby, `0.17677669529663687` from `**`).
 *
 * glibc's `pow` is not correctly rounded either. Its source documents a
 * worst-case error of 0.54 ULP (`sysdeps/ieee754/dbl-64/e_pow.c`): 0.5 from
 * the final rounding plus up to 0.04 from the approximation. So when the
 * exact result lies within 0.04 ULP of the midpoint between two doubles,
 * glibc may return either one (measured: 45 of the 100,000 pairs, every one
 * within 0.0037 ULP of a midpoint; exact halfway cases such as
 * `123456789^2.0`, `63^9` and `3^34` round either way). Outside that band the
 * correctly rounded double is the only value within 0.54 ULP, so it is
 * exactly glibc's answer. This module therefore:
 *
 * - computes the exact result to far more than 53 bits — exactly with
 *   `BigInt` for an integer exponent, through `exp(y * ln x)` in 320-bit
 *   fixed point otherwise — and returns the correctly rounded double;
 * - refuses with `UnsupportedFeatureError` when the exact result lies within
 *   0.04 ULP of a midpoint, because the gem's answer there depends on the
 *   platform's `pow`, not on anything this port can reproduce.
 */

import { UnsupportedFeatureError } from "../core/errors";

/** Fixed-point fraction bits for the logarithm/exponential path. */
const PRECISION = 320n;
const ONE = 1n << PRECISION;

/** An exact positive dyadic value `mantissa * 2^exponent`. */
interface Dyadic {
  readonly mantissa: bigint;
  readonly exponent: number;
}

/** Decomposes a finite, positive double into an integer mantissa and a binary exponent. */
function decompose(x: number): Dyadic {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const mantissa = biased === 0 ? fraction : fraction | (1n << 52n);
  const exponent = (biased === 0 ? 1 : biased) - 1075;
  return { mantissa, exponent };
}

function bitLength(value: bigint): number {
  return value === 0n ? 0 : value.toString(2).length;
}

function nearHalfwayRefusal(): never {
  throw new UnsupportedFeatureError(
    "evaluate",
    "the exact power lies within 0.04 ULP of halfway between two doubles, where " +
      "Ruby's answer depends on the rounding of the platform C library's pow",
  );
}

/**
 * Rounds `mantissa * 2^exponent` (plus a positive amount smaller than one unit
 * of `mantissa` when `sticky` is set) to the nearest double. With
 * `refuseNearHalf` (the `pow` path) a value within 0.04 ULP of a midpoint is
 * refused (module header); without it, an exact tie rounds to even — IEEE
 * round-to-nearest, what C's `ldexp` does on this platform. Handles subnormal
 * results and overflow to `Infinity`.
 */
function roundDyadic(
  mantissa: bigint,
  exponent: number,
  sticky: boolean,
  refuseNearHalf = true,
): number {
  if (mantissa === 0n) return 0;
  const top = bitLength(mantissa) - 1 + exponent;
  // Beyond the double range there is nothing to round: at or above 2^1024 the
  // result is Infinity, below 2^-1076 (under half the smallest subnormal) 0.
  if (top >= 1024) return Infinity;
  if (top < -1076) return 0;
  const lsb = Math.max(top - 52, -1074);
  const shift = lsb - exponent;
  let quotient: bigint;
  if (shift <= 0) {
    if (sticky) {
      // Cannot happen: sticky callers always supply more than 54 bits.
      throw new Error("roundDyadic: sticky bit below an exact mantissa");
    }
    quotient = mantissa << BigInt(-shift);
  } else {
    const bigShift = BigInt(shift);
    quotient = mantissa >> bigShift;
    const remainder = mantissa - (quotient << bigShift);
    const full = 1n << bigShift;
    // Position within the ULP is remainder/full; refuse when
    // |remainder/full - 1/2| < 0.04, i.e. |2 remainder - full| * 25 < 2 full.
    const offset = 2n * remainder - full;
    if (refuseNearHalf && (offset < 0n ? -offset : offset) * 25n < 2n * full) {
      nearHalfwayRefusal();
    }
    if (offset > 0n || (offset === 0n && sticky)) quotient += 1n;
    else if (offset === 0n && (quotient & 1n) === 1n) quotient += 1n;
  }
  // `quotient` has at most 54 bits and `2 ** lsb` is a power of two, so the
  // product is exact — or overflows to `Infinity`, which is the right answer.
  return Number(quotient) * 2 ** lsb;
}

/** `x^n` for an integer `n`, exactly rounded; `null` when too large to compute exactly. */
function exactIntegerPower(x: number, n: number): number | null {
  let { mantissa, exponent } = decompose(x);
  while ((mantissa & 1n) === 0n) {
    mantissa >>= 1n;
    exponent += 1;
  }
  const magnitude = Math.abs(n);
  if (bitLength(mantissa) * magnitude > 4096) return null;
  const power = mantissa ** BigInt(magnitude);
  if (n > 0) return roundDyadic(power, exponent * magnitude, false);
  // x^-n = 2^(-exponent*n) / mantissa^n: divide with enough quotient bits
  // for a correct rounding, carrying any remainder as a sticky bit.
  const extra = bitLength(power) + 64;
  const quotient = (1n << BigInt(extra)) / power;
  const inexact = quotient * power !== 1n << BigInt(extra);
  if (!inexact) return roundDyadic(quotient, -extra - exponent * magnitude, false);
  return roundDyadic((quotient << 1n) | 1n, -extra - 1 - exponent * magnitude, true);
}

/** `2 * atanh(s)` for a fixed-point `s` with `|s| < 1/2`. */
function twiceAtanh(s: bigint): bigint {
  // `>>` floors, so a negative term would settle at -1 instead of 0.
  if (s < 0n) return -twiceAtanh(-s);
  const square = (s * s) >> PRECISION;
  let term = s;
  let sum = 0n;
  for (let k = 1n; term !== 0n; k += 2n) {
    sum += term / k;
    term = (term * square) >> PRECISION;
  }
  return sum * 2n;
}

/** `ln 2 = 2 atanh(1/3)`, fixed point. */
const LN2 = twiceAtanh(ONE / 3n);

/** `ln x` for a finite, positive double, fixed point. */
function fixedLog(x: number): bigint {
  const { mantissa, exponent } = decompose(x);
  // x = f * 2^k with f in [1/sqrt2, sqrt2), where the atanh series converges fast.
  let k = bitLength(mantissa) - 1 + exponent;
  let f = (mantissa << PRECISION) >> BigInt(bitLength(mantissa) - 1);
  if (f * f > 2n * ONE * ONE) {
    f >>= 1n;
    k += 1;
  }
  const s = ((f - ONE) << PRECISION) / (f + ONE);
  return twiceAtanh(s) + BigInt(k) * LN2;
}

/** `exp(r)` for a fixed-point `|r| <= ln2`, fixed point. */
function fixedExp(r: bigint): bigint {
  let term = ONE;
  let sum = 0n;
  for (let k = 1n; term !== 0n; k += 1n) {
    sum += term;
    term = (term * r) / (k << PRECISION);
  }
  return sum;
}

/** `x^y` through `exp(y ln x)`, carrying the approximation's inexactness as a sticky bit. */
function logExpPower(x: number, y: number): number {
  const { mantissa, exponent } = decompose(y < 0 ? -y : y);
  const log = fixedLog(x);
  let t = log * mantissa;
  t = exponent >= 0 ? t << BigInt(exponent) : t >> BigInt(-exponent);
  if (y < 0) t = -t;
  // t = n ln2 + r, so x^y = 2^n e^r.
  const n = t >= 0n ? (t + LN2 / 2n) / LN2 : -((-t + LN2 / 2n) / LN2);
  if (n > 1100n) return Infinity;
  if (n < -1200n) return 0;
  const r = t - n * LN2;
  return roundDyadic((fixedExp(r) << 1n) | 1n, Number(n) - Number(PRECISION) - 1, true);
}

/**
 * `pow(x, y)`, correctly rounded, for finite `x > 0` and finite `y !== 0`;
 * refuses an exact halfway result (module header).
 */
export function correctlyRoundedPow(x: number, y: number): number {
  if (Number.isInteger(y)) {
    const exact = exactIntegerPower(x, y);
    if (exact !== null) return exact;
  }
  return logExpPower(x, y);
}

/**
 * C's `ldexp(d, shift)`: `d * 2^shift`, exact unless the result is subnormal
 * or overflows, where it rounds to nearest, ties to even. Ruby's
 * `Integer#fdiv` and `Rational#to_f` end with it (`bignum.c`'s `big_fdiv`).
 */
export function ldexp(d: number, shift: number): number {
  if (d === 0 || !Number.isFinite(d)) return d;
  const { mantissa, exponent } = decompose(Math.abs(d));
  const magnitude = roundDyadic(mantissa, exponent + shift, false, false);
  return d < 0 ? -magnitude : magnitude;
}
