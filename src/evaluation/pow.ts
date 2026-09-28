/**
 * `pow(x, y)` for finite, positive `x` and finite, non-zero `y`, standing in
 * for the C library `pow()` that Ruby's `**` calls for every Float case.
 *
 * JavaScript's `**` is not that function: V8 computes it with its own
 * algorithm, which differs from glibc's `pow` — what the oracle's Ruby calls —
 * for a double-digit fraction of ordinary inputs (`4^0.5^(-2.5)` is
 * `0.1767766952966369` in Ruby, `0.17677669529663687` from `**`), reproducibly
 * measured by `scripts/measure-pow-rounding-band.mjs`
 * (seed `20260923`, 99,747 finite, non-zero pairs after filtering, Linux
 * x86_64, Node v20.20.2, Ruby 4.0.1, measured 2026-09-23):
 * **9,768 mismatches (9.79%)** against Ruby's own `**`, over `x` and `y`
 * sampled across a wide exponent range, not narrowed to "ordinary" inputs —
 * a different, wider domain from whatever produced this comment's earlier,
 * unreproducible "about 5%" / "4,825 of 100,000" claim, which cited Python
 * rather than the oracle's own Ruby and recorded neither its sampling domain
 * nor a seed. That earlier figure is retracted, not reconciled: nothing here
 * shows it was wrong for whatever it measured, only that it cannot be
 * reproduced from this repository and this one now can be, by anyone, with
 * this script.
 *
 * glibc's `pow` is not correctly rounded either. Its source documents a
 * worst-case error of 0.54 ULP (`sysdeps/ieee754/dbl-64/e_pow.c`): 0.5 from
 * the final rounding plus up to 0.04 from the approximation — but that 0.04
 * is glibc's OWN worst-case bound on its approximation error, not a measured
 * rate of actual wrong answers, and sizing the refusal band directly from it
 * over-refuses: geometric proximity to a midpoint (some fraction `f` of
 * inputs sit within any fixed radius `r` of one, roughly `2r` of them for `r`
 * small) is not the same thing as glibc actually rounding the wrong way
 * there. `scripts/measure-pow-glibc-accuracy.mjs` measures the latter
 * directly, the same method
 * `.codex-context/evidence/2026-09-23-libm/libm/reference.rb` (a sibling
 * measurement, same repository, 2026-09-23) used for `sin`/`cos`/`tan`/
 * `asin`/`acos`/etc: an arbitrary-precision reference (`BigDecimal`/`BigMath`
 * at 70 decimal digits, or an exact `Rational` power for an integer
 * exponent), the double it correctly rounds to, and the sampled value's
 * distance from the midpoint between that double and its neighbor, as a
 * fraction of one ULP (0 = an exact tie, 0.5 = as far from a tie as
 * possible). Measured (seed `20260923`, the SAME 99,747 pairs
 * `measure-pow-rounding-band.mjs` uses, plus 10 hand-typed cases such as
 * `2^0.5`, `10^-3`, `1.1^10`, `3^0.2` a reviewer would actually write —
 * `scripts/lib/pow-sample.mjs`'s `HUMAN_TYPED_CASES` — Linux x86_64, Ruby
 * 4.0.1, measured 2026-09-23, 99,034 in-domain pairs): glibc's `pow` is
 * correctly rounded for **98,940 of them (99.9051%)**; of the **94
 * mismatches**, the worst sat **0.006035 ULP** from the midpoint — an order
 * of magnitude tighter than the 0.04 the old, ungrounded band used, and
 * consistent with the sibling measurement's finding that `sin`/`cos`/`tan`/
 * `asin`/`acos` misses all sat within 0.022 ULP. `EXACT_HALFWAY_BAND` below
 * is that worst miss times a 2x margin (0.012071 ULP), which this module
 * rounds UP to the clean, easily-verified fraction **1/80 (0.0125 ULP)** —
 * still comfortably above the measured requirement, not at the edge of it.
 * No miss in this sample sat anywhere near the "stop and report instead of
 * widening the band" line (> 0.1 ULP); if a future, larger sample ever finds
 * one, that is a sign the band needs a different kind of fix, not a wider
 * number.
 *
 * Outside the band, the correctly rounded double is the only value within
 * 0.54 ULP of glibc's answer, so it IS glibc's answer — the property that
 * makes refusing INSIDE the band, and only inside it, sound. Re-measuring
 * `measure-pow-rounding-band.mjs` at the new band width, on the SAME 99,747
 * pairs, confirms both halves of that: the refusal rate falls from 7.96%
 * (the old 0.04 band) to **2.46% (2,450 pairs)**, and, still, **zero**
 * disagreements with Ruby's own `**` outside it (`test/evaluation/
 * pow-rounding-band-corpus.json`'s `outOfBandPortDisagreesWithRubyCount`).
 * This module therefore:
 *
 * - computes the exact result to far more than 53 bits — exactly with
 *   `BigInt` for an integer exponent, through `exp(y * ln x)` in 320-bit
 *   fixed point otherwise — and returns the correctly rounded double;
 * - refuses with `UnsupportedFeatureError` when the exact result lies within
 *   `EXACT_HALFWAY_BAND` ULP of a midpoint, because the gem's answer there
 *   depends on the platform's `pow`, not on anything this port can
 *   reproduce.
 */

import { UnsupportedFeatureError } from "../core/errors";

/**
 * Fixed-point fraction bits for the logarithm/exponential path — shared with
 * `libm.ts`, whose `Math` functions use the same fixed point.
 */
export const PRECISION = 320n;
export const ONE = 1n << PRECISION;

/** An exact positive dyadic value `mantissa * 2^exponent`. */
export interface Dyadic {
  readonly mantissa: bigint;
  readonly exponent: number;
}

/** Decomposes a finite, positive double into an integer mantissa and a binary exponent. */
export function decompose(x: number): Dyadic {
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

/**
 * The refusal band's radius, as a fraction of one ULP, and its reciprocal —
 * `1/80` (module header: measured worst glibc miss 0.006035 ULP, x2 margin
 * 0.012071, rounded UP to this clean fraction). `roundDyadic` uses the
 * reciprocal directly (`offset * NEAR_HALFWAY_BAND_INVERSE < 2n * full` is
 * `|offset/full| < 2/80 = 2 * (1/80)`, exactly the `|frac - 1/2| < 1/80` band
 * test) so the comparison stays exact `BigInt` arithmetic, never a `Number`
 * approximation of `1/80`.
 */
const NEAR_HALFWAY_BAND_INVERSE = 80n;

/**
 * A refusal band: an exact result within `1/inverse` ULP of the midpoint
 * between two doubles is refused with `refuse()` instead of rounded, because
 * the platform C library's answer there is not reliably the correctly
 * rounded one. `inverse` is a `bigint` so the band test stays exact.
 */
export interface RoundingBand {
  readonly inverse: bigint;
  readonly refuse: () => never;
}

const POW_BAND: RoundingBand = {
  inverse: NEAR_HALFWAY_BAND_INVERSE,
  refuse: () => {
    throw new UnsupportedFeatureError(
      "evaluate",
      "the exact power lies within 1/80 (0.0125) ULP of halfway between two doubles, where " +
        "Ruby's answer depends on the rounding of the platform C library's pow",
    );
  },
};

/**
 * Rounds `mantissa * 2^exponent` (plus a positive amount smaller than one unit
 * of `mantissa` when `sticky` is set) to the nearest double. With a `band`
 * (the `pow` path's, by default, or a `libm.ts` function's) a value within
 * the band of a midpoint is refused (module header); with `null`, an exact
 * tie rounds to even — IEEE round-to-nearest, what C's `ldexp` does on this
 * platform. Handles subnormal results and overflow to `Infinity`.
 */
export function roundDyadic(
  mantissa: bigint,
  exponent: number,
  sticky: boolean,
  band: RoundingBand | null = POW_BAND,
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
    // |remainder/full - 1/2| < 1/inverse, i.e. |2 remainder - full| * inverse < 2 full.
    const offset = 2n * remainder - full;
    if (band !== null && (offset < 0n ? -offset : offset) * band.inverse < 2n * full) {
      band.refuse();
    }
    if (offset > 0n || (offset === 0n && sticky)) quotient += 1n;
    else if (offset === 0n && (quotient & 1n) === 1n) quotient += 1n;
  }
  // `quotient` has at most 54 bits and `2 ** lsb` is a power of two, so the
  // product is exact — or overflows to `Infinity`, which is the right answer.
  return Number(quotient) * 2 ** lsb;
}

/**
 * The largest exact result this falls back from, in bits (`bitLength(mantissa)
 * * magnitude`, below) — chosen from a direct measurement of V8's `BigInt`
 * exponentiation-by-squaring at this size and above (a 53-bit mantissa raised
 * to enough of a power to reach each size, Node v20.20.2, Linux x86_64,
 * 2026-09-23): 409,600 bits took 11.5ms; 4,096,000 bits, 163ms; 8,000,000
 * bits, 324ms; 16,000,000 bits, 626ms; 24,000,000 bits, 1,153ms — the cost
 * stays comfortably sub-second (roughly linear in this range) up to about
 * 20,000,000 bits and only crosses one second beyond it. `1 << 20`
 * (1,048,576 bits, measured at 36ms) keeps a wide, deliberate safety margin
 * under that crossing — nowhere near where "unreasonable" starts — rather
 * than sitting at the edge of it, since a single `evaluate()` call may chain
 * several such powers. The result is otherwise well within reach: this is
 * not the memory-driven `INTEGER_BIT_LIMIT`/`RATIONAL_BIT_LIMIT` reasoning
 * (`numeric.ts`'s header), it exists only because a Float's integer-valued
 * exponent can itself be astronomically large (`Number.MAX_SAFE_INTEGER`),
 * which would otherwise demand an exact result with billions of bits.
 */
const EXACT_INTEGER_POWER_BIT_LIMIT = 1 << 20;

/** `x^n` for an integer `n`, exactly rounded; `null` when too large to compute exactly. */
function exactIntegerPower(x: number, n: number): number | null {
  let { mantissa, exponent } = decompose(x);
  while ((mantissa & 1n) === 0n) {
    mantissa >>= 1n;
    exponent += 1;
  }
  const magnitude = Math.abs(n);
  if (bitLength(mantissa) * magnitude > EXACT_INTEGER_POWER_BIT_LIMIT) return null;
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
export function twiceAtanh(s: bigint): bigint {
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
export const LN2 = twiceAtanh(ONE / 3n);

/** `ln x` for a finite, positive double, fixed point. */
export function fixedLog(x: number): bigint {
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
export function fixedExp(r: bigint): bigint {
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
  const magnitude = roundDyadic(mantissa, exponent + shift, false, null);
  return d < 0 ? -magnitude : magnitude;
}
