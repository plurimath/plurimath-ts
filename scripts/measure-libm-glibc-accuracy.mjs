#!/usr/bin/env node
// Sizes `src/evaluation/libm.ts`'s refusal bands from where glibc's `Math`
// functions actually miss the correctly rounded double — the method
// `measure-pow-glibc-accuracy.mjs` used for `pow.ts`: an arbitrary-precision
// reference (`scripts/lib/libm-reference.rb`, BigDecimal at 110 digits, with
// exact argument conversion and a hand reduction for sin/cos/tan), the
// correctly rounded double, and the exact result's distance from the
// midpoint between the doubles either side of it, as a fraction of one ULP.
//
//   node scripts/measure-libm-glibc-accuracy.mjs [--write-corpus]
//
// Requires `ruby` on PATH with `bigdecimal` — the oracle's own Ruby, since
// what is measured is the platform C library its `Math` module calls (glibc
// 2.35 on the oracle's host), not anything the plurimath gem provides.
//
// For each function, over the seeded sample (`scripts/lib/libm-sample.mjs`):
//
// - how often glibc returns the correctly rounded double, and, where it does
//   not, the worst miss's distance from the midpoint; the band this module
//   recommends for each region (`|x|` below or above `libm.ts`'s
//   SMALL_ARGUMENT) is that region's worst miss over the `uniform`, `human`
//   and `large` samples, times two, and a miss further than 0.1 ULP from the
//   midpoint is reported as one a band cannot fix;
// - whether the port's own correctly rounded result (`libm.ts`, band off)
//   equals the reference for every sample — the check that the BigInt
//   implementation is right, independently of glibc;
// - with `libm.ts`'s default behaviour (region band; for sin/cos/tan, its
//   reduction guard and exceptions table), how often the port refuses, and
//   how often, when it does not refuse, it disagrees with glibc (which must
//   be never).
//
// `libm.ts` itself is loaded through `esbuild` from the checked-out source,
// never from `dist/`, as `measure-pow-rounding-band.mjs` does.
//
// `--write-corpus` writes `test/evaluation/libm-rounding-band-corpus.json`:
// each category's figures, and every glibc miss, every hand-typed value and
// the first 250 uniform samples per function, with glibc's answer and the
// reference, which
// `test/evaluation/libm-rounding-band.spec.ts` re-checks on every run without
// Ruby.

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { FUNCTIONS, SEED, samplesFor, UNIFORM_COUNT } from "./lib/libm-sample.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
const writeCorpus = process.argv.includes("--write-corpus");

const outfile = join(mkdtempSync(join(tmpdir(), "libm-measure-")), "libm.mjs");
await build({
  entryPoints: [join(REPO_ROOT, "src/evaluation/libm.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  logLevel: "error",
});
const { BANDS, CORRECTLY_ROUNDED, SMALL_ARGUMENT } = await import(outfile);

function hexOf(x) {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  return view.getBigUint64(0).toString(16).padStart(16, "0");
}

/** Runs the Ruby reference over `hexes` in one process; resolves to its rows. */
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
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`libm-reference.rb ${fn} exited ${code}`));
      else resolve(JSON.parse(out));
    });
    child.stdin.end(JSON.stringify(hexes));
  });
}

/** A pool of `limit` concurrent jobs. */
async function pool(jobs, limit) {
  const results = new Array(jobs.length);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const index = next;
      next += 1;
      results[index] = await jobs[index]();
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

const CHUNK = 5_000;
const sampled = Object.fromEntries(FUNCTIONS.map((fn) => [fn, samplesFor(fn)]));
const jobs = [];
for (const fn of FUNCTIONS) {
  const samples = sampled[fn];
  for (let start = 0; start < samples.length; start += CHUNK) {
    const slice = samples.slice(start, start + CHUNK);
    jobs.push(async () => ({
      fn,
      start,
      rows: await rubyReference(
        fn,
        slice.map(({ x }) => hexOf(x)),
      ),
    }));
  }
}
const started = Date.now();
const chunks = await pool(jobs, Math.max(1, cpus().length));
const reference = Object.fromEntries(FUNCTIONS.map((fn) => [fn, []]));
for (const { fn, start, rows } of chunks) {
  rows.forEach((row, i) => {
    reference[fn][start + i] = row;
  });
}

const MARGIN = 2;
const FAR_MISS = 0.1;
const corpus = {
  $comment: "GENERATED by scripts/measure-libm-glibc-accuracy.mjs --write-corpus. Do not edit.",
  seed: SEED,
  uniformCount: UNIFORM_COUNT,
  platform: {
    node: process.version,
    arch: process.arch,
    os: process.platform,
    rubyVersion: execFileSync("ruby", ["-v"], { encoding: "utf8" }).trim(),
    libc: execFileSync("getconf", ["GNU_LIBC_VERSION"], { encoding: "utf8" }).trim(),
  },
  functions: {},
};
let failed = false;

/** The port's answer: `band` null for band off, undefined for its default behaviour. */
function portAnswer(fn, x, band) {
  if (fn === "sqrt") return Math.sqrt(x);
  try {
    return band === null ? CORRECTLY_ROUNDED[fn](x, null) : CORRECTLY_ROUNDED[fn](x);
  } catch (error) {
    if (error?.code === "UNSUPPORTED_FEATURE") return "refused";
    throw error;
  }
}

for (const fn of FUNCTIONS) {
  const samples = sampled[fn];
  const bands = fn === "sqrt" ? null : BANDS[fn];
  // Band sizing per region: `uniform` and `human` samples, plus `large` ones
  // for the large region. The categories near multiples of pi/2 are the
  // reduction guard's (and, below SMALL_ARGUMENT, the exhaustive
  // measurement's), not the band's.
  const regionWorst = { small: 0, large: 0 };
  const sizesBand = (category) => ["uniform", "human", "large"].includes(category);
  const byCategory = {};
  const corpusRows = [];
  let uniformKept = 0;
  let implementationDisagreements = 0;
  const implementationExamples = [];
  samples.forEach(({ category, x }, i) => {
    const [glibcHex, crHex, distance] = reference[fn][i];
    if (crHex === null) return;
    if (byCategory[category] === undefined) {
      byCategory[category] = {
        n: 0,
        correct: 0,
        misses: [],
        refused: 0,
        outOfBandDisagreements: 0,
      };
    }
    const stats = byCategory[category];
    stats.n += 1;
    const glibcCorrect = glibcHex === crHex;
    if (glibcCorrect) stats.correct += 1;
    else {
      stats.misses.push({ x, distance, glibcHex, crHex });
      if (sizesBand(category)) {
        const region = Math.abs(x) < SMALL_ARGUMENT ? "small" : "large";
        regionWorst[region] = Math.max(regionWorst[region], distance);
      }
    }
    const unbanded = hexOf(portAnswer(fn, x, null));
    if (unbanded !== crHex) {
      implementationDisagreements += 1;
      if (implementationExamples.length < 5) {
        implementationExamples.push(`x=${x} port=${unbanded} reference=${crHex}`);
      }
    }
    const banded = portAnswer(fn, x, undefined);
    if (banded === "refused") stats.refused += 1;
    else if (hexOf(banded) !== glibcHex) stats.outOfBandDisagreements += 1;
    const keep =
      !glibcCorrect || category === "human" || (category === "uniform" && uniformKept < 250);
    if (keep) {
      if (category === "uniform") uniformKept += 1;
      corpusRows.push([category, hexOf(x), glibcHex, crHex, distance]);
    }
  });

  console.log(
    `\n${fn}: band ${bands === null ? "none" : `1/${bands.small.inverse} below ${SMALL_ARGUMENT}, 1/${bands.large.inverse} above`}`,
  );
  for (const [category, stats] of Object.entries(byCategory)) {
    const worst = stats.misses.reduce((m, miss) => Math.max(m, miss.distance), 0);
    const far = stats.misses.filter((miss) => miss.distance > FAR_MISS);
    console.log(
      `  ${category.padEnd(13)} n=${stats.n} glibc correctly rounded ${stats.correct} ` +
        `(${((100 * stats.correct) / stats.n).toFixed(4)}%), misses ${stats.misses.length}, ` +
        `worst miss ${worst.toFixed(6)} ULP from midpoint, far misses (> ${FAR_MISS}) ${far.length}; ` +
        `port refuses ${stats.refused} (${((100 * stats.refused) / stats.n).toFixed(4)}%), ` +
        `out-of-band disagreements with glibc ${stats.outOfBandDisagreements}`,
    );
    for (const miss of far.slice(0, 5)) {
      console.log(
        `    far miss x=${miss.x} glibc=${miss.glibcHex} reference=${miss.crHex} dist=${miss.distance}`,
      );
    }
    if (stats.outOfBandDisagreements > 0) failed = true;
  }
  for (const region of ["small", "large"]) {
    console.log(
      `  ${region} region (|x| ${region === "small" ? "<" : ">="} ${SMALL_ARGUMENT}): worst miss ` +
        `${regionWorst[region].toFixed(6)}, recommended band (x ${MARGIN}) ` +
        `${(regionWorst[region] * MARGIN).toFixed(6)} ULP` +
        (bands === null ? "" : `; libm.ts 1/${bands[region].inverse}`),
    );
    if (bands !== null && regionWorst[region] * MARGIN > 1 / Number(bands[region].inverse)) {
      console.log(`  WARNING: the ${region} band in libm.ts is narrower than the recommendation`);
      failed = true;
    }
    if (bands === null && regionWorst[region] > 0) failed = true;
  }
  console.log(`  port vs reference disagreements (band off): ${implementationDisagreements}`);
  for (const example of implementationExamples) console.log(`    ${example}`);
  if (implementationDisagreements > 0) failed = true;
  corpus.functions[fn] = {
    bandInverse:
      bands === null
        ? null
        : { small: Number(bands.small.inverse), large: Number(bands.large.inverse) },
    regionWorstMissDistance: regionWorst,
    summary: Object.fromEntries(
      Object.entries(byCategory).map(([category, stats]) => [
        category,
        {
          n: stats.n,
          glibcCorrectlyRounded: stats.correct,
          misses: stats.misses.length,
          worstMissDistance: stats.misses.reduce((m, miss) => Math.max(m, miss.distance), 0),
          refused: stats.refused,
          outOfBandDisagreements: stats.outOfBandDisagreements,
        },
      ]),
    ),
    rows: corpusRows,
  };
}
console.log(`\nreference computed in ${((Date.now() - started) / 1000).toFixed(1)}s`);

if (writeCorpus) {
  const path = join(REPO_ROOT, "test/evaluation/libm-rounding-band-corpus.json");
  writeFileSync(path, `${JSON.stringify(corpus)}\n`);
  console.log(`wrote ${path}`);
}
if (failed) process.exitCode = 1;
