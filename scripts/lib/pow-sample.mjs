// Shared sample generation for `pow.ts`'s two measurement scripts
// (`measure-pow-rounding-band.mjs`, `measure-pow-glibc-accuracy.mjs`): the
// SAME seeded pairs feed both, so the "how often does the band trigger"
// measurement and the "where does glibc actually miss" measurement describe
// the same sample, not two different ones a reader has to reconcile.

export const SEED = 20260923;

/** mulberry32, a small, public PRNG — fixed seed so a rerun samples the exact same pairs. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random positive finite double with exponent in `[expMin, expMax]`. */
function randomPositiveDouble(rng, expMin, expMax) {
  const exponent = Math.floor(rng() * (expMax - expMin + 1)) + expMin;
  const mantissa = 1 + rng(); // [1, 2)
  return mantissa * 2 ** exponent;
}

/** A random finite `y`: ~30% exact integers (where an exact-power tie is possible at any
 * magnitude), ~70% fractional, both magnitudes up to 60 — wide enough to reach the
 * log/exp path (`pow.ts`'s `logExpPower`) as well as the exact-integer-power path. */
function randomExponent(rng) {
  const magnitude = rng() * 60;
  const signed = rng() < 0.5 ? -magnitude : magnitude;
  return rng() < 0.3 ? Math.round(signed) : signed;
}

/** `pairCount` seeded `{x, y}` pairs, `y !== 0` (`pow.ts` only handles non-zero exponents). */
export function generatePairs(pairCount) {
  const rng = mulberry32(SEED);
  return Array.from({ length: pairCount }, () => ({
    x: randomPositiveDouble(rng, -20, 20),
    y: randomExponent(rng),
  })).filter(({ y }) => y !== 0);
}

/**
 * Hand-typed cases a reviewer would actually write in an AsciiMath/LaTeX
 * formula — the seeded sample is wide-domain and uniform, which is good for
 * coverage but is not what "someone writes `2^0.5` in a formula" looks like:
 * small integer or low-precision decimal bases and exponents, clustered near
 * 0 and 1, which is exactly where a `pow` implementation's easy cases and its
 * hard cases both concentrate.
 */
export const HUMAN_TYPED_CASES = [
  { x: 2, y: 0.5 },
  { x: 10, y: -3 },
  { x: 1.1, y: 10 },
  { x: 3, y: 0.2 },
  { x: 5, y: -2 },
  { x: 7, y: 3.5 },
  { x: 0.5, y: 0.5 },
  { x: 2, y: 0.1 },
  { x: 1.5, y: 1.5 },
  { x: 2.5, y: -1.5 },
];
