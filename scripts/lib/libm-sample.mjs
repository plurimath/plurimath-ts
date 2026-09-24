// Seeded samples for `scripts/measure-libm-glibc-accuracy.mjs`: per `Math`
// function, 100,000 uniform samples over the domain a formula would reach,
// the hand-typed values a reviewer would actually write (`0.1`, `pi/4`, `90`,
// ...), and, for `sin`/`cos`/`tan`, three extra categories where a C
// library's range reduction is hardest: large arguments; the double nearest
// `k pi/2` for `k` up to `2^52` (where the result is tiny, or for `tan` huge,
// and any error in the reduced argument is magnified); and, hardest of all,
// the doubles closest to a multiple of `pi/2` at every binary exponent
// (`hardReductionCases`).

import { mulberry32 } from "./pow-sample.mjs";

export const SEED = 20260924;
export const UNIFORM_COUNT = 100_000;
const LARGE_COUNT = 10_000;
const NEAR_HALF_PI_COUNT = 10_000;
const WIDE_LOG_COUNT = 10_000;

/** A random double `(1 + u) * 2^e`, `e` uniform in `[expMin, expMax]`. */
function magnitude(rng, expMin, expMax) {
  const exponent = Math.floor(rng() * (expMax - expMin + 1)) + expMin;
  return (1 + rng()) * 2 ** exponent;
}

function signed(rng, x) {
  return rng() < 0.5 ? -x : x;
}

/** `arctan(1/n) * 2^bits` (Machin's formula below). */
function arctanInverse(n, bits) {
  const n2 = n * n;
  let term = (1n << bits) / n;
  let sum = 0n;
  for (let k = 1n; term !== 0n; k += 2n) {
    sum += (k & 2n) === 0n ? term / k : -(term / k);
    term /= n2;
  }
  return sum;
}

const PI_BITS = 1700n;
const PI_SCALED = 16n * arctanInverse(5n, PI_BITS) - 4n * arctanInverse(239n, PI_BITS);

/** The double nearest `k * pi / 2`, for a positive `bigint` `k`. */
function nearestToHalfPiMultiple(k) {
  const scaled = k * PI_SCALED; // k * pi * 2^PI_BITS
  const bits = scaled.toString(2).length;
  // Keep 64 significant bits, then let Number() round the rest (the result
  // is exact to far better than the half-ULP rounding needs at 53 bits).
  const shift = BigInt(bits - 64);
  const top = scaled >> shift;
  return Number(top) * 2 ** (Number(shift) - Number(PI_BITS) - 1);
}

/** The next `count` doubles above and below `x` (`x` positive, finite). */
function neighbours(x, count) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const out = [];
  for (let d = -count; d <= count; d += 1) {
    if (d === 0) continue;
    view.setBigUint64(0, bits + BigInt(d));
    out.push(view.getFloat64(0));
  }
  return out;
}

/**
 * Doubles nearest a multiple of pi/2: `k` near `2^E / (pi/2)` for `E`
 * uniform in `[0, 52]` — above `2^53` the doubles are further apart than
 * `pi/2`, so "the double nearest `k pi/2`" no longer lies near a zero — plus
 * the argument known to lie closest to a multiple of pi/2 of all doubles
 * (`6381956970095103 * 2^797`, Muller, "Elementary Functions", table 11.1)
 * and its neighbours.
 */
function nearHalfPiMultiples(rng) {
  const out = [6381956970095103 * 2 ** 797, ...neighbours(6381956970095103 * 2 ** 797, 2)];
  const halfPiApprox = Math.PI / 2;
  while (out.length < NEAR_HALF_PI_COUNT) {
    const e = Math.floor(rng() * 53);
    const target = 2 ** e / halfPiApprox;
    const k = BigInt(Math.max(1, Math.floor(target))) + BigInt(Math.floor(rng() * 1000));
    const x = nearestToHalfPiMultiple(k);
    if (Number.isFinite(x)) out.push(signed(rng, x));
  }
  return out;
}

/**
 * The doubles closest to a multiple of `pi/2` at each binary exponent: for
 * `x = h * 2^e` with `h` in `[2^52, 2^53)`, `|x - k pi/2|` is `2^e |h - k b|`
 * with `b = (pi/2) / 2^e`, smallest where `h/k` is a convergent or
 * semiconvergent of `b`'s continued fraction. For every `e` from `-52`
 * (`x` in `[1, 2)`) to `971` (the largest doubles), the `perExponent` in-range
 * candidates with the smallest `|h - k b|` are kept — about two a exponent,
 * with `|x mod pi/2|` from `2^-49` down to `2^-61`, the whole range's minimum.
 */
export function hardReductionCases(perExponent = 6) {
  const lo = 1n << 52n;
  const hi = 1n << 53n;
  const out = [];
  for (let e = -52; e <= 971; e += 1) {
    const shift = PI_BITS + 1n + BigInt(e); // b = PI_SCALED / 2^shift
    let num = PI_SCALED;
    let den = 1n << shift;
    let [h2, h1, k2, k1] = [0n, 1n, 1n, 0n];
    const candidates = [];
    for (let step = 0; step < 200 && den !== 0n; step += 1) {
      const a = num / den;
      [num, den] = [den, num - a * den];
      for (let t = 1n; t <= a; t += 1n) {
        const h = h2 + t * h1;
        if (h >= hi) break;
        if (h >= lo) candidates.push([h, k2 + t * k1]);
        if (t > 4n && t < a - 4n) t = a - 4n; // only the ends of a long run matter
      }
      [h2, h1, k2, k1] = [h1, a * h1 + h2, k1, a * k1 + k2];
      if (h1 >= hi) break;
    }
    const scored = candidates.map(([h, k]) => {
      const d = h * (1n << shift) - k * PI_SCALED;
      return [h, d < 0n ? -d : d];
    });
    scored.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    for (const [h] of scored.slice(0, perExponent)) out.push(Number(h) * 2 ** e);
  }
  return [...new Set(out)];
}

/**
 * Values a person types into a formula: small integers and short decimals,
 * degree-like angles, and the multiples of `pi` a formula computes as Ruby
 * does, in double arithmetic (`pi/4` is `Math::PI / 4`), with their
 * negatives.
 */
const HUMAN_BASE = [
  0.1,
  0.2,
  0.25,
  0.3,
  0.5,
  0.75,
  1,
  1.5,
  2,
  2.5,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  12,
  15,
  20,
  30,
  45,
  60,
  90,
  100,
  120,
  180,
  270,
  360,
  1000,
  1e6,
  1e-3,
  1e-5,
  Math.PI,
  Math.PI / 2,
  Math.PI / 3,
  Math.PI / 4,
  Math.PI / 6,
  2 * Math.PI,
  (3 * Math.PI) / 2,
  Math.E,
  Math.SQRT2,
  Math.SQRT1_2,
  Math.sqrt(3) / 2,
  0.9,
  0.99,
  0.999,
];
export const HUMAN_TYPED = [...HUMAN_BASE, ...HUMAN_BASE.map((x) => -x)];

/** Each function's in-domain predicate (the gem raises a domain error outside it). */
const DOMAIN = {
  sin: () => true,
  cos: () => true,
  tan: () => true,
  atan: () => true,
  asin: (x) => Math.abs(x) <= 1,
  acos: (x) => Math.abs(x) <= 1,
  exp: () => true,
  log: (x) => x > 0,
  sqrt: (x) => x > 0,
};

export const FUNCTIONS = Object.keys(DOMAIN);

/**
 * `{ category, x }` samples for one function: `uniform`, `human`, and, where
 * they apply, `large`, `near-half-pi` and `wide`. Each function draws from
 * its own seeded stream, so adding a function never changes another's sample.
 */
export function samplesFor(fn) {
  const rng = mulberry32(SEED + FUNCTIONS.indexOf(fn));
  const uniform = [];
  for (let i = 0; i < UNIFORM_COUNT; i += 1) {
    switch (fn) {
      case "asin":
      case "acos":
        uniform.push(i % 2 === 0 ? rng() * 2 - 1 : signed(rng, magnitude(rng, -20, -1)));
        break;
      case "exp":
        uniform.push(rng() * (709.78 + 745) - 745);
        break;
      case "log":
        uniform.push(magnitude(rng, -20, 20));
        break;
      case "sqrt":
        uniform.push(magnitude(rng, -1074, 1023));
        break;
      default:
        uniform.push(signed(rng, magnitude(rng, -20, 20)));
    }
  }
  const samples = [
    ...uniform.map((x) => ({ category: "uniform", x })),
    ...HUMAN_TYPED.filter(DOMAIN[fn]).map((x) => ({ category: "human", x })),
  ];
  if (fn === "sin" || fn === "cos" || fn === "tan") {
    for (let i = 0; i < LARGE_COUNT; i += 1) {
      samples.push({ category: "large", x: signed(rng, magnitude(rng, 21, 1022)) });
    }
    for (const x of nearHalfPiMultiples(rng)) samples.push({ category: "near-half-pi", x });
    for (const x of hardReductionCases()) samples.push({ category: "hard-reduction", x });
  }
  if (fn === "log") {
    for (let i = 0; i < WIDE_LOG_COUNT; i += 1) {
      samples.push({ category: "wide", x: magnitude(rng, -1074, 1022) });
    }
  }
  return samples.filter(({ x }) => Number.isFinite(x) && x !== 0 && DOMAIN[fn](x));
}
