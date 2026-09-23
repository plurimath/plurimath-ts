#!/usr/bin/env node
// Measures the real cost `numeric.ts`'s `INTEGER_BIT_LIMIT`/`RATIONAL_BIT_LIMIT`
// and `pow.ts`'s `EXACT_INTEGER_POWER_BIT_LIMIT` are meant to bound: BigInt
// multiplication (what an Integer chain of `+`/`-`/`*`/`**` costs) and BigInt
// gcd (what reducing a Rational costs — V8 has no fast gcd, `numeric.ts`'s
// header), at each limit and at multiples of it, so the comments citing these
// numbers can be checked again rather than trusted.
//
//   node scripts/measure-numeric-size-limits.mjs
//
// Deterministic (seeded), but reports timings, which vary by machine and load
// — this is a reproducible METHOD, not a promise of identical milliseconds
// elsewhere; re-run it before trusting a comment that cites its numbers on a
// different machine.

const SEED = 20260923;
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBig(rng, bits) {
  let hex = "";
  for (let i = 0; i < Math.ceil(bits / 32); i++) {
    hex += Math.floor(rng() * 0x100000000).toString(16).padStart(8, "0");
  }
  return BigInt(`0x${hex}`) | (1n << BigInt(bits - 1));
}

function euclidGcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

function timeMs(fn) {
  const t0 = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

const rng = mulberry32(SEED);

console.log(`platform: node ${process.version}, ${process.platform}/${process.arch}`);
console.log("");
console.log("-- multiply (INTEGER_BIT_LIMIT = 1<<22 = 4,194,304 bits) --");
for (const bits of [1 << 22, 1 << 23, 1 << 24, 1 << 25]) {
  const a = randomBig(rng, bits);
  const b = randomBig(rng, bits);
  console.log(`  ${bits.toLocaleString()} bits: ${timeMs(() => a * b).toFixed(2)}ms`);
}

console.log("");
console.log("-- gcd (RATIONAL_BIT_LIMIT = 1<<16 = 65,536 bits; the pre-reduction");
console.log("   guard in `rational()` admits up to 2x that into gcd) --");
for (const bits of [1 << 16, 1 << 17, 1 << 18]) {
  const a = randomBig(rng, bits);
  const b = randomBig(rng, bits);
  console.log(`  ${bits.toLocaleString()} bits: ${timeMs(() => euclidGcd(a, b)).toFixed(2)}ms`);
}

console.log("");
console.log("-- pow.ts exactIntegerPower (EXACT_INTEGER_POWER_BIT_LIMIT = 1<<20) --");
const mantissa = (1n << 52n) | 1n;
for (const targetBits of [1 << 19, 1 << 20, 1 << 21, 1 << 24, 20_000_000]) {
  const magnitude = Math.floor(targetBits / 53);
  console.log(
    `  ~${targetBits.toLocaleString()} bits (mantissa^${magnitude}): ` +
      `${timeMs(() => mantissa ** BigInt(magnitude)).toFixed(2)}ms`,
  );
}
