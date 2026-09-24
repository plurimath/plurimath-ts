/**
 * Ruby's `Math.sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `exp`, `log` and
 * `sqrt` (`math.c`), standing in for the C library functions they call —
 * glibc's, on the Linux host the oracle is measured on.
 *
 * JavaScript's `Math` functions are not those functions: V8 has its own
 * implementations, which differ from glibc in the last bit for a fraction of
 * ordinary inputs. glibc's are not correctly rounded either (except `sqrt`,
 * which IEEE 754 requires to be), but they miss the correctly rounded double
 * only when the exact result lies very close to the midpoint between two
 * doubles. So, as `pow.ts` does for `pow`, each function here:
 *
 * - computes the exact result in `BigInt` fixed point (`pow.ts`'s 320
 *   fraction bits, with range reduction by a 1,536-bit `pi` for the
 *   trigonometric functions, so a large argument such as `1e300` is reduced
 *   exactly enough), far beyond the 53 bits a double holds;
 * - rounds it to the nearest double, and refuses with
 *   `UnsupportedFeatureError` when it lies within the function's measured
 *   band of a midpoint (`BANDS` below), where the gem's answer depends on
 *   glibc's rounding rather than on anything this port can reproduce — and,
 *   for `sin`/`cos`/`tan`, where glibc's range reduction decides the last
 *   bits: at `|x| >= SMALL_ARGUMENT`, when the argument lies within the
 *   reduction guard of a multiple of `pi/2` (`LARGE_ARGUMENT`); below it, at
 *   exactly the arguments the exhaustive measurement found glibc wrong on
 *   outside the band (`REDUCTION_EXCEPTIONS`).
 *
 * Each band is sized by `scripts/measure-libm-glibc-accuracy.mjs` the way
 * `pow.ts`'s was, per argument region: the worst distance from the midpoint
 * of any sampled input glibc rounds the wrong way, times two, rounded up to
 * a clean fraction. Below `SMALL_ARGUMENT`, every double within `2^-35` of a
 * nonzero multiple of `pi/2` — where sampling is weakest and glibc's
 * reduction matters most — was checked against glibc, both signs, by
 * `scripts/measure-libm-reduction-exhaustive.mjs`: 1,748,992 doubles near
 * 651 multiples. glibc's `sin` was correctly rounded on all of them; `cos`
 * missed 2 and `tan` 28, and the 3 magnitudes among those outside the band
 * are the exceptions table. With it, the port refuses or returns glibc's
 * double on every one.
 * Outside the band the correctly rounded double is glibc's answer; inside
 * it the port refuses. `sqrt` needs no band: IEEE 754 requires it correctly
 * rounded, JavaScript's `Math.sqrt` and glibc's both are, and the
 * measurement confirms it.
 *
 * Around the C calls this reproduces `math.c` itself: the argument
 * conversion (`numeric.ts`'s `mathArgument`), the domain checks that raise
 * `Math::DomainError` ("Numerical argument is out of domain - asin"), which
 * the evaluator rescues as `MathDomainError`, `Math.sqrt`'s `+0.0` for
 * either zero, and `Math.log`'s exact path for a Bignum too large for a
 * double.
 */

import { UnsupportedFeatureError } from "../core/errors";
import { MathDomainError } from "./errors";
import { REDUCTION_EXCEPTIONS } from "./libm-reduction-exceptions";
import { bitLength, mathArgument, type RubyNumeric } from "./numeric";
import {
  decompose,
  fixedExp,
  fixedLog,
  LN2,
  ONE,
  PRECISION,
  type RoundingBand,
  roundDyadic,
} from "./pow";

const W = PRECISION;

/** The C library functions this module stands in for. */
export type LibmFunction = "sin" | "cos" | "tan" | "asin" | "acos" | "atan" | "exp" | "log";

function band(fn: LibmFunction, inverse: bigint, radius: string): RoundingBand {
  return {
    inverse,
    refuse: () => {
      throw new UnsupportedFeatureError(
        "evaluate",
        `the exact ${fn} lies within ${radius} ULP of halfway between two doubles, where ` +
          `Ruby's answer depends on the rounding of the platform C library's ${fn}`,
      );
    },
  };
}

/**
 * The argument magnitude below which a function uses its `small` band, and
 * below which `sin`/`cos`/`tan` are not reduction-guarded: every double under
 * it that lies near a multiple of `pi/2` is covered by the exhaustive
 * measurement instead (`REDUCTION_EXCEPTIONS`).
 */
export const SMALL_ARGUMENT = 1024;

/** A function's band for `|x| < SMALL_ARGUMENT` and for larger arguments. */
export interface RegionBands {
  readonly small: RoundingBand;
  readonly large: RoundingBand;
}

/**
 * Each function's refusal band, `1/inverse` ULP (module header), per argument
 * region: the worst glibc miss `scripts/measure-libm-glibc-accuracy.mjs` found
 * among its `uniform` and `human` samples in that region (`large` samples
 * too, for `|x| >= SMALL_ARGUMENT`), times two, rounded up to a clean
 * fraction. The script prints each figure and fails if a band here is
 * narrower than it; `TODO.plan/deferred.md`'s "Evaluation: `Math` function
 * results inside glibc's rounding band" records them. Where a region has no
 * measured miss at all (`atan` and `log` above `SMALL_ARGUMENT`), or holds no
 * argument (`asin`, `acos`, `exp`: `|x| <= 1`, or overflow past `710`), the
 * region keeps the other region's band rather than an unmeasured narrower one.
 */
export const BANDS: Readonly<Record<LibmFunction, RegionBands>> = {
  sin: { small: band("sin", 40n, "1/40 (0.025)"), large: band("sin", 40n, "1/40 (0.025)") },
  cos: { small: band("cos", 50n, "1/50 (0.02)"), large: band("cos", 32n, "1/32 (0.03125)") },
  tan: { small: band("tan", 11n, "1/11 (0.0909)"), large: band("tan", 25n, "1/25 (0.04)") },
  asin: { small: band("asin", 60n, "1/60 (0.0167)"), large: band("asin", 60n, "1/60 (0.0167)") },
  acos: { small: band("acos", 50n, "1/50 (0.02)"), large: band("acos", 50n, "1/50 (0.02)") },
  atan: { small: band("atan", 40n, "1/40 (0.025)"), large: band("atan", 40n, "1/40 (0.025)") },
  exp: { small: band("exp", 80n, "1/80 (0.0125)"), large: band("exp", 80n, "1/80 (0.0125)") },
  log: { small: band("log", 125n, "1/125 (0.008)"), large: band("log", 125n, "1/125 (0.008)") },
};

/** The band `fn` uses for the argument `x`. */
export function bandFor(fn: LibmFunction, x: number): RoundingBand {
  return Math.abs(x) < SMALL_ARGUMENT ? BANDS[fn].small : BANDS[fn].large;
}

/**
 * The reduction guard for `sin`, `cos` and `tan` at `|x| >= SMALL_ARGUMENT`.
 * Near a multiple of `pi/2` the result is tiny (or, for `tan`, huge), and an
 * absolute error in the C library's reduced argument `r` becomes a relative
 * error of about `error / |r|` in the result — far beyond any band. This
 * refuses when `|r|` is below `2^-SMALL_ARGUMENT_GUARD_BITS` (for `|x| <
 * LARGE_ARGUMENT`) or `2^-LARGE_ARGUMENT_GUARD_BITS` (above), each at least
 * `2^67` times the largest reduced-argument error measured in its tier — so
 * an admitted result's relative error from that source stays under `2^-67`,
 * `2^-15` ULP. `scripts/measure-libm-reduction-error.mjs` measures those
 * errors on the hardest doubles for range reduction at every binary exponent
 * (the continued-fraction convergents of `pi/2`,
 * `scripts/lib/libm-sample.mjs`'s `hardReductionCases`), prints each tier's
 * figure and the guard it implies, and fails if the constants here are less
 * strict. Only a reduced argument whose result is computed from `sin r` is
 * guarded (`guardReduction`).
 */
export const LARGE_ARGUMENT = 2 ** 26;
export const SMALL_ARGUMENT_GUARD_BITS = 35n;
export const LARGE_ARGUMENT_GUARD_BITS = 24n;

function reductionRefusal(fn: "sin" | "cos" | "tan", detail: string): never {
  throw new UnsupportedFeatureError(
    "evaluate",
    `the argument ${detail}, where the platform C library's ${fn} is not reliably the ` +
      "correctly rounded double and Ruby's answer depends on it",
  );
}

/**
 * Refuses a reduced argument inside the reduction guard (see
 * `LARGE_ARGUMENT`) — but only where the result is computed from `sin r`
 * (`sin` at an even multiple of `pi/2`, `cos` at an odd one, `tan` at
 * either), because only there is it tiny, or for `tan` huge, when `r` is.
 * Where it is `cos r`, near `±1`, an error in `r` barely moves it:
 * `measure-libm-reduction-error.mjs` counts glibc's misses on those branches.
 * Below `SMALL_ARGUMENT` nothing is guarded; only the doubles the exhaustive
 * measurement found glibc wrong on outside the band are refused
 * (`REDUCTION_EXCEPTIONS`).
 */
function guardReduction(fn: "sin" | "cos" | "tan", x: number, reduced: Reduced): void {
  if (x < SMALL_ARGUMENT) {
    if (REDUCTION_EXCEPTIONS[fn].has(x)) {
      reductionRefusal(fn, "is one where glibc's result was measured outside the band");
    }
    return;
  }
  if (!reduced.reduced) return;
  const fromSinR = fn === "tan" || (reduced.quadrant % 2 === 0) === (fn === "sin");
  if (!fromSinR) return;
  const bits = x < LARGE_ARGUMENT ? SMALL_ARGUMENT_GUARD_BITS : LARGE_ARGUMENT_GUARD_BITS;
  const magnitude = reduced.r < 0n ? -reduced.r : reduced.r;
  if (magnitude < ONE >> bits) reductionRefusal(fn, `lies within 2^-${bits} of a multiple of pi/2`);
}

/**
 * Rounds a fixed-point value (`W` fraction bits) to the nearest double,
 * refusing inside `band`. The value is an approximation of an irrational
 * result, so it is never taken as exact: the sticky bit places it strictly
 * inside its last unit, and the band — orders of magnitude wider than the
 * approximation's error — is what makes the rounding decision safe.
 */
function roundFixed(value: bigint, rounding: RoundingBand | null): number {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const result = roundDyadic((magnitude << 1n) | 1n, -Number(W) - 1, true, rounding);
  return negative ? -result : result;
}

/** `|x|` in fixed point, truncated; `x` finite. */
function toFixed(x: number): bigint {
  if (x === 0) return 0n;
  const { mantissa, exponent } = decompose(Math.abs(x));
  const shift = exponent + Number(W);
  const magnitude = shift >= 0 ? mantissa << BigInt(shift) : mantissa >> BigInt(-shift);
  return x < 0 ? -magnitude : magnitude;
}

/** `floor(sqrt(n))` for `n >= 0`, by Newton's method. */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(bitLength(n) / 2));
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

/** `arctan(1/n)` scaled by `2^bits`, for an integer `n >= 2`. */
function arctanInverse(n: bigint, bits: bigint): bigint {
  const n2 = n * n;
  let term = (1n << bits) / n;
  let sum = 0n;
  for (let k = 1n; term !== 0n; k += 2n) {
    sum += (k & 2n) === 0n ? term / k : -(term / k);
    term /= n2;
  }
  return sum;
}

/** The bits of `pi` computed once, enough to reduce any finite double (`reduce`). */
const PI_BITS = 1536n;
let piCache: bigint | null = null;

/** `pi` scaled by `2^bits` (`bits <= PI_BITS - 64`), by Machin's formula. */
function piFixed(bits: bigint): bigint {
  if (piCache === null) {
    const guard = PI_BITS + 64n;
    piCache = (16n * arctanInverse(5n, guard) - 4n * arctanInverse(239n, guard)) >> 64n;
  }
  return piCache >> (PI_BITS - bits);
}

/**
 * `x = k * pi/2 + r` for a finite `x >= 0`: `r` in fixed point, with
 * `|r| <= pi/4` (up to rounding), and `k mod 4`. `pi/2` is taken to
 * `W + 64 + e + 53` bits for an argument below `2^(e + 53)`, so `k * pi/2`
 * is exact to within `2^-(W + 10)` even for the largest double, `k` near
 * `2^1024`.
 */
interface Reduced {
  readonly r: bigint;
  readonly quadrant: number;
  /** Whether `x` was reduced at all (`k > 0`), rather than `r` being `x` itself. */
  readonly reduced: boolean;
}

function reduce(x: number): Reduced {
  if (x < Math.PI / 4) return { r: toFixed(x), quadrant: 0, reduced: false };
  const { mantissa, exponent } = decompose(x);
  const bits = W + 64n + BigInt(Math.max(0, exponent + 53));
  const halfPi = piFixed(bits) >> 1n;
  const scaled = mantissa << (BigInt(exponent) + bits);
  const k = (scaled + halfPi / 2n) / halfPi;
  const remainder = scaled - k * halfPi;
  const shift = bits - W;
  const r = remainder >= 0n ? remainder >> shift : -(-remainder >> shift);
  return { r, quadrant: Number(k % 4n), reduced: k > 0n };
}

/** `sin r` and `cos r` for a fixed-point `|r| <= pi/4 + tiny`, by Taylor series. */
function sinCos(r: bigint): { readonly sin: bigint; readonly cos: bigint } {
  const negative = r < 0n;
  const a = negative ? -r : r;
  const square = (a * a) >> W;
  let sinTerm = a;
  let sin = 0n;
  for (let k = 1n; sinTerm !== 0n; k += 2n) {
    sin += (k & 2n) === 0n ? sinTerm : -sinTerm;
    sinTerm = (sinTerm * square) / ((k + 1n) * (k + 2n) * ONE);
  }
  let cosTerm = ONE;
  let cos = 0n;
  for (let k = 0n; cosTerm !== 0n; k += 2n) {
    cos += (k & 2n) === 0n ? cosTerm : -cosTerm;
    cosTerm = (cosTerm * square) / ((k + 1n) * (k + 2n) * ONE);
  }
  return { sin: negative ? -sin : sin, cos };
}

/**
 * `atan u` for a fixed-point `0 <= u <= 1`: four argument halvings
 * (`atan u = 2 atan(u / (1 + sqrt(1 + u^2)))`) bring `u` under `0.05`, where
 * the Taylor series gains nine bits a term.
 */
function fixedAtan(u: bigint): bigint {
  let v = u;
  for (let i = 0; i < 4; i += 1) {
    const root = isqrt(ONE * ONE + v * v);
    v = (v << W) / (ONE + root);
  }
  const square = (v * v) >> W;
  let term = v;
  let sum = 0n;
  for (let k = 1n; term !== 0n; k += 2n) {
    sum += ((k & 2n) === 0n ? term : -term) / k;
    term = (term * square) >> W;
  }
  return sum << 4n;
}

/** `atan x` for any finite `x`, fixed point. */
function fixedAtanAny(x: bigint): bigint {
  const negative = x < 0n;
  const a = negative ? -x : x;
  const result = a <= ONE ? fixedAtan(a) : (piFixed(W) >> 1n) - fixedAtan((ONE << W) / a);
  return negative ? -result : result;
}

/** `asin x` for a fixed-point `|x| <= 1`: `2 atan(x / (1 + sqrt(1 - x^2)))`. */
function fixedAsin(x: bigint): bigint {
  const root = isqrt(ONE * ONE - x * x);
  return 2n * fixedAtanAny((x << W) / (ONE + root));
}

/**
 * Below `2^-30`, `sin`, `tan`, `asin` and `atan` of `x` round to `x` itself:
 * each is `x` times `1 + O(x^2)`, and `x^2/3 < 2^-61` is far inside the
 * `2^-54` relative half-spacing of the doubles on either side of `x`, so the
 * exact result is nowhere near a midpoint and cannot be refused. Fixed point
 * would lose a tiny (or subnormal) `x`'s relative precision, so these
 * return it directly.
 */
const TINY = 2 ** -30;

function correctlyRoundedSin(
  x: number,
  rounding: RoundingBand | null = bandFor("sin", x),
  guard: boolean = rounding !== null,
): number {
  if (!Number.isFinite(x)) return Number.NaN;
  if (Math.abs(x) < TINY) return x;
  const reduced = reduce(Math.abs(x));
  if (guard) guardReduction("sin", Math.abs(x), reduced);
  const { r, quadrant } = reduced;
  const { sin, cos } = sinCos(r);
  const value = [sin, cos, -sin, -cos][quadrant] as bigint;
  return roundFixed(x < 0 ? -value : value, rounding);
}

function correctlyRoundedCos(
  x: number,
  rounding: RoundingBand | null = bandFor("cos", x),
  guard: boolean = rounding !== null,
): number {
  if (!Number.isFinite(x)) return Number.NaN;
  if (x === 0) return 1;
  const reduced = reduce(Math.abs(x));
  if (guard) guardReduction("cos", Math.abs(x), reduced);
  const { r, quadrant } = reduced;
  const { sin, cos } = sinCos(r);
  return roundFixed([cos, -sin, -cos, sin][quadrant] as bigint, rounding);
}

function correctlyRoundedTan(
  x: number,
  rounding: RoundingBand | null = bandFor("tan", x),
  guard: boolean = rounding !== null,
): number {
  if (!Number.isFinite(x)) return Number.NaN;
  if (Math.abs(x) < TINY) return x;
  const reduced = reduce(Math.abs(x));
  if (guard) guardReduction("tan", Math.abs(x), reduced);
  const { r, quadrant } = reduced;
  const { sin, cos } = sinCos(r);
  const value = quadrant % 2 === 0 ? (sin << W) / cos : -((cos << W) / sin);
  return roundFixed(x < 0 ? -value : value, rounding);
}

function correctlyRoundedAsin(
  x: number,
  rounding: RoundingBand | null = bandFor("asin", x),
): number {
  if (Number.isNaN(x) || Math.abs(x) < TINY) return x;
  return roundFixed(fixedAsin(toFixed(x)), rounding);
}

function correctlyRoundedAcos(
  x: number,
  rounding: RoundingBand | null = bandFor("acos", x),
): number {
  if (Number.isNaN(x)) return x;
  if (x === 1) return 0;
  return roundFixed((piFixed(W) >> 1n) - fixedAsin(toFixed(x)), rounding);
}

function correctlyRoundedAtan(
  x: number,
  rounding: RoundingBand | null = bandFor("atan", x),
): number {
  if (Number.isNaN(x) || Math.abs(x) < TINY) return x;
  if (!Number.isFinite(x)) {
    const halfPi = roundFixed(piFixed(W) >> 1n, rounding);
    return x > 0 ? halfPi : -halfPi;
  }
  return roundFixed(fixedAtanAny(toFixed(x)), rounding);
}

/**
 * `exp x`: `x = n ln2 + r` with `|r| <= ln2/2`, so `exp x = 2^n exp r`, as
 * `pow.ts`'s `logExpPower` computes it. Past `710` the result overflows
 * (`exp(709.79) > DBL_MAX`), and below `-746` it is under half the smallest
 * subnormal (`exp(-745.14) < 2^-1075`), so both are answered without
 * computing.
 */
function correctlyRoundedExp(x: number, rounding: RoundingBand | null = bandFor("exp", x)): number {
  if (Number.isNaN(x)) return x;
  if (x === 0) return 1;
  if (x > 710) return Infinity;
  if (x < -746) return 0;
  const t = toFixed(x);
  const n = t >= 0n ? (t + LN2 / 2n) / LN2 : -((-t + LN2 / 2n) / LN2);
  const r = t - n * LN2;
  return roundDyadic((fixedExp(r) << 1n) | 1n, Number(n) - Number(W) - 1, true, rounding);
}

/** `log x` for `x > 0` (`log(1)` is exactly `0`). */
function correctlyRoundedLog(x: number, rounding: RoundingBand | null = bandFor("log", x)): number {
  if (Number.isNaN(x) || x === Infinity) return x;
  if (x === 1) return 0;
  return roundFixed(fixedLog(x), rounding);
}

/**
 * The correctly rounded C function, refusing inside its band (and, for
 * `sin`/`cos`/`tan`, the reduction guard) — or, with a `null` band, never
 * refusing — for the measurement script and the spec.
 */
export const CORRECTLY_ROUNDED: Readonly<
  Record<LibmFunction, (x: number, rounding?: RoundingBand | null, guard?: boolean) => number>
> = {
  sin: correctlyRoundedSin,
  cos: correctlyRoundedCos,
  tan: correctlyRoundedTan,
  asin: correctlyRoundedAsin,
  acos: correctlyRoundedAcos,
  atan: correctlyRoundedAtan,
  exp: correctlyRoundedExp,
  log: correctlyRoundedLog,
};

/** Ruby: `math.c`'s `domain_error` — `Math::DomainError`, rescued as `MathDomainError`. */
function domainError(fn: string): never {
  throw new MathDomainError(`Numerical argument is out of domain - ${fn}`);
}

/** Ruby: `Math.sin` — `sin(Get_Double(x))`. */
export function mathSin(x: RubyNumeric): number {
  return correctlyRoundedSin(mathArgument(x));
}

/** Ruby: `Math.cos`. */
export function mathCos(x: RubyNumeric): number {
  return correctlyRoundedCos(mathArgument(x));
}

/** Ruby: `Math.tan`. */
export function mathTan(x: RubyNumeric): number {
  return correctlyRoundedTan(mathArgument(x));
}

/** Ruby: `Math.asin` — `domain_check_range(d, -1.0, 1.0)` first; `NaN` passes it. */
export function mathAsin(x: RubyNumeric): number {
  const d = mathArgument(x);
  if (d < -1 || d > 1) domainError("asin");
  return correctlyRoundedAsin(d);
}

/** Ruby: `Math.acos`, with `Math.asin`'s range check. */
export function mathAcos(x: RubyNumeric): number {
  const d = mathArgument(x);
  if (d < -1 || d > 1) domainError("acos");
  return correctlyRoundedAcos(d);
}

/** Ruby: `Math.atan`. */
export function mathAtan(x: RubyNumeric): number {
  return correctlyRoundedAtan(mathArgument(x));
}

/** Ruby: `Math.exp`. */
export function mathExp(x: RubyNumeric): number {
  return correctlyRoundedExp(mathArgument(x));
}

/**
 * Ruby: `Math.log(x)` (`rb_math_log`, one argument). A positive Bignum of
 * 1,024 bits or more (`DBL_MAX_EXP`) would overflow a double, so
 * `get_double_rshift` first shifts it right by `numbits = bits - 53`, and the
 * result is `log(d) + numbits * M_LN2` in double arithmetic. Otherwise a
 * negative argument (`-0.0` is not) raises the domain error, a zero is
 * `-Infinity` (the "pole error"), and anything else is `log(d)`.
 */
export function mathLog(x: RubyNumeric): number {
  if (x.kind === "integer" && x.value > 0n) {
    const bits = bitLength(x.value);
    if (bits >= 1024) {
      const numbits = bits - 53;
      const d = Number(x.value >> BigInt(numbits));
      return correctlyRoundedLog(d) + numbits * Math.LN2;
    }
  }
  const d = mathArgument(x);
  if (d < 0) domainError("log");
  if (d === 0) return -Infinity;
  return correctlyRoundedLog(d);
}

/**
 * Ruby: `Math.sqrt` (`rb_math_sqrt`) — a negative argument raises the domain
 * error (`-0.0` is not negative), a zero of either sign is `+0.0`, and
 * anything else is C's `sqrt`, which IEEE 754 requires correctly rounded, as
 * it requires of `Math.sqrt`.
 */
export function mathSqrt(x: RubyNumeric): number {
  const d = mathArgument(x);
  if (d < 0) domainError("sqrt");
  if (d === 0) return 0;
  return Math.sqrt(d);
}
