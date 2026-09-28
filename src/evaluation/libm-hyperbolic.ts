/**
 * Ruby's `Math.sinh`, `Math.cosh` and `Math.tanh` (`math.c`), standing in for
 * glibc's `sinh`, `cosh` and `tanh` the way `libm.ts` stands in for `sin`,
 * `exp` and the rest: no glibc code is transcribed. Each function
 *
 * - computes the exact result in `BigInt` fixed point (`pow.ts`'s 320
 *   fraction bits) from `e^x = 2^n e^r`, `|r| <= ln2/2`, and rounds it to the
 *   nearest double;
 * - refuses with `UnsupportedFeatureError` when that exact result lies within
 *   the band of the argument's region of a midpoint between two doubles,
 *   because there glibc (which is not correctly rounded) may return either
 *   neighbour, and Ruby prints whichever it returned.
 *
 * glibc 2.35 computes these through fdlibm's `expm1` and `exp` with branch
 * points at `|x| = 2^-28` (`sinh`), `2^-55` (`cosh`, `tanh`), `ln2/2`
 * (`cosh`), `1` (`sinh`, `tanh`), `22` and `ln(DBL_MAX)`, so its error differs
 * per branch; `REGIONS` gives each branch its own band, sized from
 * `scripts/measure-libm-hyperbolic-glibc.mjs` (the figures and the method
 * are in `TODO.plan/deferred.md`, "Evaluation: the hyperbolic functions").
 * A region whose measured error could put glibc's answer more than one
 * neighbour away, or near any midpoint, is refused outright.
 */

import { UnsupportedFeatureError } from "../core/errors";
import { toFixed } from "./libm";
import { mathArgument, type RubyNumeric } from "./numeric";
import { fixedExp, LN2, ONE, PRECISION, type RoundingBand, roundDyadic } from "./pow";

const W = PRECISION;

/** The C library functions this module stands in for. */
export type HyperbolicFunction = "sinh" | "cosh" | "tanh";

/**
 * Below `2^-30`, `sinh x` and `tanh x` are `x (1 + O(x^2))` and `cosh x` is
 * `1 + x^2/2`, with the correction under `2^-61` relative: far inside half the
 * spacing of the doubles around `x` (or `1`), so the correctly rounded result
 * is `x` (or `1`) and nowhere near a midpoint. Returned directly, because
 * fixed point would lose a tiny or subnormal `x`'s relative precision.
 */
const TINY = 2 ** -30;

/** `sinh`/`cosh` overflow: `e^711 / 2 > 2^1024`. */
const OVERFLOW = 711;

/**
 * `tanh x` for `|x| >= 23`: `1 - 2e^-46` is within `2^-66` of `1`, far
 * nearer than the midpoint `1 - 2^-54` below it, so the result is `±1`.
 */
const TANH_SATURATED = 23;

/**
 * The exact result, before rounding: either a double that needs no rounding,
 * or `mantissa * 2^exponent` (magnitude, with a sticky low bit set: the value
 * is an approximation of an irrational number, never exact) and its sign.
 */
export type ExactHyperbolic =
  | { readonly kind: "double"; readonly value: number }
  | {
      readonly kind: "dyadic";
      readonly mantissa: bigint;
      readonly exponent: number;
      readonly negative: boolean;
    };

/** `e^a = 2^n * scaled / ONE` for a fixed-point `a >= 0`. */
function expScaled(a: bigint): { readonly n: bigint; readonly scaled: bigint; readonly r: bigint } {
  const n = (a + LN2 / 2n) / LN2;
  const r = a - n * LN2;
  return { n, scaled: fixedExp(r), r };
}

function dyadic(value: bigint, fractionBits: bigint, negative: boolean): ExactHyperbolic {
  return {
    kind: "dyadic",
    mantissa: (value << 1n) | 1n,
    exponent: -Number(fractionBits) - 1,
    negative,
  };
}

/** `sinh x` or `cosh x`: `(2^n A -/+ 2^-n B) / 2`, `A = e^r`, `B = e^-r`. */
function sinhCosh(fn: "sinh" | "cosh", x: number): ExactHyperbolic {
  if (Number.isNaN(x)) return { kind: "double", value: x };
  const a = Math.abs(x);
  if (fn === "cosh") {
    if (a === Infinity || a >= OVERFLOW) return { kind: "double", value: Infinity };
    if (a < TINY) return { kind: "double", value: 1 };
  } else {
    if (a === Infinity || a >= OVERFLOW)
      return { kind: "double", value: x > 0 ? Infinity : -Infinity };
    if (a < TINY) return { kind: "double", value: x };
  }
  const { n, scaled, r } = expScaled(toFixed(a));
  const inverse = fixedExp(-r);
  const twice = fn === "sinh" ? (scaled << (2n * n)) - inverse : (scaled << (2n * n)) + inverse;
  // twice / ONE / 2^n is 2 sinh (or 2 cosh); halve it once more.
  return dyadic(twice, W + n + 1n, fn === "sinh" && x < 0);
}

/** `tanh x = (e^2a - 1) / (e^2a + 1)` for `a = |x|`, with the sign of `x`. */
function tanhExact(x: number): ExactHyperbolic {
  if (Number.isNaN(x)) return { kind: "double", value: x };
  const a = Math.abs(x);
  if (a >= TANH_SATURATED) return { kind: "double", value: x > 0 ? 1 : -1 };
  if (a < TINY) return { kind: "double", value: x };
  const { n, scaled } = expScaled(toFixed(a) * 2n);
  const e = scaled << n;
  const extra = W + 64n;
  const quotient = ((e - ONE) << extra) / (e + ONE);
  return dyadic(quotient, extra, x < 0);
}

/** The exact result of `fn(x)` (`ExactHyperbolic`). */
export function exactHyperbolic(fn: HyperbolicFunction, x: number): ExactHyperbolic {
  return fn === "tanh" ? tanhExact(x) : sinhCosh(fn, x);
}

/** Rounds an exact result to the nearest double, refusing inside `band`. */
export function roundHyperbolic(exact: ExactHyperbolic, band: RoundingBand | null): number {
  if (exact.kind === "double") return exact.value;
  const magnitude = roundDyadic(exact.mantissa, exact.exponent, true, band);
  return exact.negative ? -magnitude : magnitude;
}

/**
 * The position of an exact result inside its last unit, as `offset / full`
 * with `offset = 2 * remainder - full` (so `0` is the midpoint and `±full`
 * the doubles either side), or `null` for a result that needs no rounding.
 * For the measurement script: the distance from the midpoint of a glibc
 * miss is `|offset| / (2 * full)` ULP.
 */
export function midpointOffset(
  exact: ExactHyperbolic,
): { readonly offset: bigint; readonly full: bigint } | null {
  if (exact.kind === "double") return null;
  // The same split `pow.ts`'s `roundDyadic` makes.
  const bits = exact.mantissa.toString(2).length;
  const top = bits - 1 + exact.exponent;
  if (top >= 1024) return null;
  const lsb = Math.max(top - 52, -1074);
  const shift = BigInt(lsb - exact.exponent);
  if (shift <= 0n) return null;
  const quotient = exact.mantissa >> shift;
  const full = 1n << shift;
  const remainder = exact.mantissa - (quotient << shift);
  return { offset: 2n * remainder - full, full };
}

/**
 * One region of arguments, `|x| < below` (and at or above the previous
 * region's `below`), with its band — `1/inverse` ULP of a midpoint — or
 * `null`: every argument in it refused.
 */
export interface HyperbolicRegion {
  readonly name: string;
  readonly below: number;
  readonly inverse: bigint | null;
  readonly band: RoundingBand | null;
}

function region(
  fn: HyperbolicFunction,
  name: string,
  below: number,
  inverse: bigint | null,
): HyperbolicRegion {
  const band: RoundingBand | null =
    inverse === null
      ? null
      : {
          inverse,
          refuse: () => {
            throw new UnsupportedFeatureError(
              "evaluate",
              `the exact ${fn} lies within 1/${inverse} ULP of halfway between two doubles (${name}), ` +
                `where Ruby's answer depends on the rounding of the platform C library's ${fn}`,
            );
          },
        };
  return { name, below, inverse, band };
}

/** glibc 2.35's branch points (fdlibm compares the high word only). */
export const BRANCH = {
  /** `2^-55`: `cosh` returns `1`, `tanh` returns `x (1 + x)` below it. */
  tiny: 2 ** -55,
  /** `2^-28`: `sinh` returns `x` below it. */
  sinhTiny: 2 ** -28,
  /** High word `0x3fd62e43`, just above `ln2/2`: `cosh`'s `expm1` branch below it. */
  halfLn2: 0.3465735912322998,
  one: 1,
  twentyTwo: 22,
  /** High word `0x40862E42`, just below `ln(DBL_MAX)`: `exp(|x|) / 2` below it. */
  lnMax: 709.7822265625,
  /**
   * The double after `0x408633CE 8fb9f87d` (`710.4758600739439`), from which
   * glibc's `sinh` and `cosh` return `Infinity` without computing — as the
   * exact result, `e^x / 2 >= 2^1024`, also rounds.
   */
  overflow: 710.475860073944,
} as const;

/**
 * Each function's regions and bands, from
 * `scripts/measure-libm-hyperbolic-glibc.mjs` (recorded with seed `20260928`,
 * `test/evaluation/libm-hyperbolic-corpus.json`, and checked on two more
 * seeds; `TODO.plan/deferred.md`, "Evaluation: the hyperbolic functions",
 * has every figure). A band is at least twice the worst distance from the
 * midpoint of any glibc miss measured in the region, as a clean fraction. A region is refused (`null`) where glibc's
 * misses reach within a few thousandths of an exact double, so its error
 * approaches or passes one ULP and no band short of the whole unit is safe:
 * the `expm1` branches of all three, and `sinh`/`cosh` between `ln(DBL_MAX)`
 * and the overflow threshold, where glibc computes `exp(|x|/2)^2 / 2`.
 */
export const REGIONS: Readonly<Record<HyperbolicFunction, readonly HyperbolicRegion[]>> = {
  sinh: [
    // glibc returns x itself, which is the correctly rounded result.
    region("sinh", "|x| < 2^-28", BRANCH.sinhTiny, 512n),
    region("sinh", "2^-28 <= |x| < 22", BRANCH.twentyTwo, null),
    // exp(|x|)/2: worst miss 0.003156 ULP.
    region("sinh", "22 <= |x| < ln(DBL_MAX)", BRANCH.lnMax, 80n),
    region("sinh", "ln(DBL_MAX) <= |x| <= the overflow threshold", BRANCH.overflow, null),
    region("sinh", "|x| past the overflow threshold", Infinity, 512n),
  ],
  cosh: [
    region("cosh", "|x| < 2^-55", BRANCH.tiny, 512n),
    region("cosh", "2^-55 <= |x| < 0.03125", 0.03125, 1024n),
    region("cosh", "0.03125 <= |x| < 0.0625", 0.0625, 128n),
    region("cosh", "0.0625 <= |x| < 0.09375", 0.09375, 64n),
    region("cosh", "0.09375 <= |x| < 0.125", 0.125, 32n),
    region("cosh", "0.125 <= |x| < 0.15625", 0.15625, 20n),
    region("cosh", "0.15625 <= |x| < 0.1875", 0.1875, 14n),
    region("cosh", "0.1875 <= |x| < 0.21875", 0.21875, 12n),
    region("cosh", "0.21875 <= |x| < 0.25", 0.25, 7n),
    region("cosh", "0.25 <= |x| < 0.28125", 0.28125, 6n),
    region("cosh", "0.28125 <= |x| < 0.3125", 0.3125, 5n),
    region("cosh", "0.3125 <= |x| < 22", BRANCH.twentyTwo, null),
    region("cosh", "22 <= |x| < ln(DBL_MAX)", BRANCH.lnMax, 80n),
    region("cosh", "ln(DBL_MAX) <= |x| <= the overflow threshold", BRANCH.overflow, null),
    region("cosh", "|x| past the overflow threshold", Infinity, 512n),
  ],
  tanh: [
    region("tanh", "|x| < 2^-55", BRANCH.tiny, 512n),
    region("tanh", "2^-55 <= |x| < 1.625", 1.625, null),
    region("tanh", "1.625 <= |x| < 1.75", 1.75, 3n),
    region("tanh", "1.75 <= |x| < 1.875", 1.875, 4n),
    region("tanh", "1.875 <= |x| < 2", 2, 5n),
    region("tanh", "2 <= |x| < 2.25", 2.25, 7n),
    region("tanh", "2.25 <= |x| < 2.5", 2.5, 11n),
    region("tanh", "2.5 <= |x| < 2.75", 2.75, 20n),
    region("tanh", "2.75 <= |x| < 3", 3, 30n),
    region("tanh", "3 <= |x| < 3.5", 3.5, 64n),
    region("tanh", "3.5 <= |x|", Infinity, 160n),
  ],
};

/** The region `|x|` falls in (a finite `x`). */
export function regionFor(fn: HyperbolicFunction, x: number): HyperbolicRegion {
  const a = Math.abs(x);
  const regions = REGIONS[fn];
  return regions.find((r) => a < r.below) ?? (regions[regions.length - 1] as HyperbolicRegion);
}

function regionRefusal(fn: HyperbolicFunction, r: HyperbolicRegion): never {
  throw new UnsupportedFeatureError(
    "evaluate",
    `the platform C library's ${fn} is not reliably within one ULP for ${r.name}, ` +
      "so Ruby's answer there depends on it",
  );
}

/**
 * The port's answer for the C library's `fn(x)`: `NaN` for `NaN`, the exact
 * limit for an infinity, and otherwise the correctly rounded double — refused
 * inside the band of `x`'s region, or anywhere in a region with no band, even
 * where the correctly rounded result needs no computing (glibc's `tanh` of
 * `1e-13` is not `1e-13`).
 */
export function hyperbolic(fn: HyperbolicFunction, x: number): number {
  const exact = exactHyperbolic(fn, x);
  if (Number.isNaN(x) || !Number.isFinite(x)) return roundHyperbolic(exact, null);
  const r = regionFor(fn, x);
  if (r.band === null) regionRefusal(fn, r);
  return roundHyperbolic(exact, r.band);
}

/** Ruby: `Math.sinh` — `sinh(Get_Double(x))`. */
export function mathSinh(x: RubyNumeric): number {
  return hyperbolic("sinh", mathArgument(x));
}

/** Ruby: `Math.cosh`. */
export function mathCosh(x: RubyNumeric): number {
  return hyperbolic("cosh", mathArgument(x));
}

/** Ruby: `Math.tanh`. */
export function mathTanh(x: RubyNumeric): number {
  return hyperbolic("tanh", mathArgument(x));
}
