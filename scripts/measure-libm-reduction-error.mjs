#!/usr/bin/env node
// Reproduces the figures `src/evaluation/libm.ts`'s reduction guard cites for
// sin/cos/tan at `|x| >= SMALL_ARGUMENT`: how large the C library's error in
// its reduced argument gets, measured on the hardest doubles for range
// reduction — at every binary exponent from 2^0 to 2^1023, the doubles
// closest to a multiple of pi/2 (`scripts/lib/libm-sample.mjs`'s
// `hardReductionCases`, continued-fraction convergents of pi/2).
//
//   node scripts/measure-libm-reduction-error.mjs
//
// For a result computed from `sin r` (sin at an even multiple of pi/2, cos at
// an odd one, tan at either) the result is about `±r` (or `±1/r`), so glibc's
// relative error times `|r|` estimates its absolute error in `r`:
// `|glibc - reference| / |reference| * |r|`, where `reference` is the
// correctly rounded double from `scripts/lib/libm-reference.rb` and `r` is
// computed exactly here. The estimate includes glibc's final rounding, so it
// is an upper bound on the reduction error, not a lower one.
//
// Per tier — `[SMALL_ARGUMENT, LARGE_ARGUMENT)` and `[LARGE_ARGUMENT, inf)`,
// read from `libm.ts`, the first sized from `[1, LARGE_ARGUMENT)` (see
// `tiers` below) — this prints the case count, the largest estimated
// error, the guard it implies (refuse `|r| < 2^-bits` with `bits =
// floor(-log2(error) - 67)`, so an admitted result's relative error from the
// reduction stays under 2^-67), and glibc's misses on the `cos r` branches,
// which the guard leaves unguarded. It fails when `libm.ts`'s guard is less
// strict than a tier's measured figure implies. The tier below
// SMALL_ARGUMENT is printed for comparison; it is not guarded
// (`measure-libm-reduction-exhaustive.mjs` covers it).
//
// Requires `ruby` on PATH with `bigdecimal`.

import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { hardReductionCases, PI_BITS, PI_SCALED } from "./lib/libm-sample.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
const outfile = join(mkdtempSync(join(tmpdir(), "libm-reduction-")), "libm.mjs");
await build({
  entryPoints: [join(REPO_ROOT, "src/evaluation/libm.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  logLevel: "error",
});
const { SMALL_ARGUMENT, LARGE_ARGUMENT, SMALL_ARGUMENT_GUARD_BITS, LARGE_ARGUMENT_GUARD_BITS } =
  await import(outfile);

function hexOf(x) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  return view.getBigUint64(0).toString(16).padStart(16, "0");
}

function fromHex(hex) {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, BigInt(`0x${hex}`));
  return view.getFloat64(0);
}

/** `{ k, log2r }` for `x = k pi/2 + r`, exactly. */
function reduction(x) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, Math.abs(x));
  const bits = view.getBigUint64(0);
  const m = (bits & ((1n << 52n) - 1n)) | (1n << 52n);
  const e = Number((bits >> 52n) & 0x7ffn) - 1075;
  const shift = BigInt(e) + PI_BITS + 1n; // x * 2^(PI_BITS+1) against k * PI_SCALED
  const scaled = shift >= 0n ? m << shift : m >> -shift;
  const k = (scaled + PI_SCALED / 2n) / PI_SCALED;
  const d = scaled - k * PI_SCALED;
  const magnitude = d < 0n ? -d : d;
  return { k, log2r: magnitude.toString(2).length - Number(PI_BITS) - 1 };
}

function rubyReference(fn, hexes) {
  return new Promise((resolve, reject) => {
    const child = spawn("ruby", [join(HERE, "lib", "libm-reference.rb"), fn], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`${fn} exited ${code}`)),
    );
    child.stdin.end(JSON.stringify(hexes));
  });
}

const cases = hardReductionCases();
const hexes = cases.map(hexOf);
const [sin, cos, tan] = await Promise.all(
  ["sin", "cos", "tan"].map((fn) => rubyReference(fn, hexes)),
);
const reference = { sin, cos, tan };

// The lower guarded tier, [SMALL_ARGUMENT, LARGE_ARGUMENT), holds only about
// 50 sin-r hard cases, and glibc may answer every one exactly (as it does on
// glibc 2.35), leaving no error to size a guard from. Its guard is therefore
// sized from the whole range below LARGE_ARGUMENT, [1, LARGE_ARGUMENT), which
// includes the hard cases below SMALL_ARGUMENT; the tier's own figure is
// printed alongside.
const tiers = [
  { name: `[1, ${SMALL_ARGUMENT})`, lo: 0, hi: SMALL_ARGUMENT, bits: null },
  {
    name: `[${SMALL_ARGUMENT}, 2^${Math.log2(LARGE_ARGUMENT)})`,
    lo: SMALL_ARGUMENT,
    hi: LARGE_ARGUMENT,
    bits: null,
  },
  {
    name: `[1, 2^${Math.log2(LARGE_ARGUMENT)}), sizing the guard for [${SMALL_ARGUMENT}, 2^${Math.log2(LARGE_ARGUMENT)})`,
    lo: 0,
    hi: LARGE_ARGUMENT,
    bits: Number(SMALL_ARGUMENT_GUARD_BITS),
  },
  {
    name: `[2^${Math.log2(LARGE_ARGUMENT)}, inf)`,
    lo: LARGE_ARGUMENT,
    hi: Infinity,
    bits: Number(LARGE_ARGUMENT_GUARD_BITS),
  },
];
let failed = false;
console.log(`${cases.length} hard reduction cases, sin/cos/tan each`);
for (const tier of tiers) {
  let n = 0;
  let worst = 0;
  let worstCase = "";
  let cosBranchMisses = 0;
  let cosBranchCases = 0;
  cases.forEach((x, i) => {
    if (!(x >= tier.lo && x < tier.hi)) return;
    const { k, log2r } = reduction(x);
    for (const fn of ["sin", "cos", "tan"]) {
      const [glibcHex, crHex] = reference[fn][i];
      const fromSinR = fn === "tan" || (k % 2n === 0n) === (fn === "sin");
      if (!fromSinR) {
        cosBranchCases += 1;
        if (glibcHex !== crHex) cosBranchMisses += 1;
        continue;
      }
      n += 1;
      const g = fromHex(glibcHex);
      const c = fromHex(crHex);
      const error = (Math.abs(g - c) / Math.abs(c)) * 2 ** log2r;
      if (error > worst) {
        worst = error;
        worstCase = `${fn}(${x}), |r| ~ 2^${log2r}`;
      }
    }
  });
  const log2worst = worst === 0 ? -Infinity : Math.log2(worst);
  const implied = worst === 0 ? null : Math.floor(-log2worst - 67);
  console.log(
    `${tier.name}: ${n} sin-r results, largest reduced-argument error 2^${log2worst.toFixed(1)}` +
      (worstCase ? ` (${worstCase})` : "") +
      `; implied guard ${implied === null ? "none (no error measured)" : `2^-${implied}`}` +
      `; libm.ts ${tier.bits === null ? "not sized from this row" : `2^-${tier.bits}`}` +
      `; glibc misses on cos-r branches ${cosBranchMisses} of ${cosBranchCases}`,
  );
  if (tier.bits !== null && (implied === null || tier.bits > implied)) {
    console.log(
      `  FAIL: libm.ts's guard for ${tier.name} is less strict than the measurement implies`,
    );
    failed = true;
  }
}
if (failed) process.exitCode = 1;
