#!/usr/bin/env node
// The differential of `src/evaluation/libm-hyperbolic.ts` against Ruby's
// `Math` (glibc 2.35 on the oracle's host): `sinh`, `cosh`, `tanh`, and the
// gem's `sech`/`csch`/`coth` (`1.0 / Math.cosh(x)`, and so on, raising
// `DivisionByZeroError` on a zero).
//
//   PATH="$(mise where node@24.18.0)/bin:$(mise where ruby@4.0.1)/bin:$PATH" node scripts/measure-libm-hyperbolic-glibc.mjs [--write-corpus] [--scale N] [--seed N]
//   PATH="$(mise where node@24.18.0)/bin:$(mise where ruby@4.0.1)/bin:$PATH" node scripts/measure-libm-hyperbolic-glibc.mjs --expm1-order [--seed N]
//
// Requires the oracle's Ruby (4.0.1, whose `Math.sinh` is glibc's) as `ruby`
// and Node v24.18.0 as `node`, and refuses anything else: `mise.toml` pins
// only Node's major version, and `mise x` can resolve either tool to another
// install, so the command puts both first on PATH itself.
//
// `--expm1-order` instead compares `libm-expm1.ts`'s `expm1` with Ruby's
// `Math.expm1` in both polynomial orders (`splitOrder`, which the port uses,
// and fdlibm's `hornerOrder`), over a seeded sample of `|x| < 44` (the range
// the hyperbolic functions call it on), and prints each order's mismatch
// count. It exits nonzero if the split order has any mismatch.
//
// Per function and region (`REGIONS`), over the seeded sample
// (`hyperbolicSamples` below: log-uniform and linear-uniform arguments, both
// signs, dense uniform and log-uniform samples in every region, thousands of
// consecutive doubles either side of every branch point and region edge,
// subnormals, hand-typed values, zeros, infinities and NaN), it prints how
// many arguments the port answers and refuses, and how many answers differ
// from Ruby's. It exits nonzero if one answered argument differs from Ruby
// (the function or its reciprocal), or if a region whose path never calls
// `exp` (`direct`, `expm1`) refuses anything.

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { build } from "esbuild";
import { mulberry32 } from "./lib/pow-sample.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
const FUNCTIONS = ["sinh", "cosh", "tanh"];
const seedArg = process.argv.indexOf("--seed");
export const SEED = seedArg >= 0 ? Number(process.argv[seedArg + 1]) : 20260928;

const VIEW = new DataView(new ArrayBuffer(8));
function hexOf(x) {
  VIEW.setFloat64(0, x);
  return VIEW.getBigUint64(0).toString(16).padStart(16, "0");
}
function fromBits(bits) {
  VIEW.setBigUint64(0, bits);
  return VIEW.getFloat64(0);
}
function bitsOf(x) {
  VIEW.setFloat64(0, x);
  return VIEW.getBigUint64(0);
}

async function loadModule() {
  const outfile = join(mkdtempSync(join(tmpdir(), "libm-hyp-")), "hyp.mjs");
  await build({
    entryPoints: [join(REPO_ROOT, "src/evaluation/libm-hyperbolic.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile,
    logLevel: "error",
  });
  return { outfile, module: await import(outfile) };
}

// ---------------------------------------------------------------- worker ---
if (!isMainThread) {
  const { outfile, fn, hexes } = workerData;
  const mod = await import(outfile);
  const rows = [];
  for (const hex of hexes) {
    const x = fromBits(BigInt(`0x${hex}`));
    let answered = null;
    try {
      answered = hexOf(mod.hyperbolic(fn, x));
    } catch (error) {
      // Only a refusal counts as no answer; anything else is a bug and stops the run.
      if (error?.constructor?.name !== "UnsupportedFeatureError") throw error;
      answered = null;
    }
    rows.push(answered);
  }
  parentPort.postMessage(rows);
}

// --------------------------------------------------------------- samples ---
function randomDouble(rng, expMin, expMax) {
  const exponent = Math.floor(rng() * (expMax - expMin + 1)) + expMin;
  const hi = BigInt(Math.floor(rng() * 2 ** 20));
  const lo = BigInt(Math.floor(rng() * 2 ** 32));
  const biased = BigInt(exponent + 1023);
  return fromBits((biased << 52n) | (hi << 32n) | lo);
}

function neighbours(x, count) {
  const out = [];
  const bits = bitsOf(x);
  for (let i = -count; i <= count; i += 1) {
    const b = bits + BigInt(i);
    if (b > 0n && b < 0x7ff0000000000000n) out.push(fromBits(b));
  }
  return out;
}

const HUMAN = [
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
  18,
  19,
  20,
  21,
  22,
  23,
  25,
  30,
  50,
  100,
  200,
  500,
  700,
  709,
  709.5,
  710,
  710.4,
  710.5,
  711,
  1000,
  1e-3,
  1e-5,
  1e-8,
  1e-10,
  1e-15,
  1e-20,
  1e-300,
  Math.LN2,
  Math.PI,
  Math.E,
  Math.PI / 2,
  Math.PI / 4,
  Math.SQRT2,
  Math.SQRT1_2,
  0.01,
  0.05,
  0.001,
  0.123,
  1.23,
  12.3,
  0.7,
  0.9,
  1.1,
  1.2,
  0.35,
  0.4,
];

/**
 * The seeded sample for one function: `{x, category}`. `scale` multiplies
 * every random count (1 is the recorded run).
 */
function hyperbolicSamples(fn, branches, scale, regions) {
  const rng = mulberry32(SEED + FUNCTIONS.indexOf(fn));
  const out = [];
  const add = (category, x) => {
    out.push({ category, x });
    out.push({ category, x: -x });
  };
  // Log-uniform over the exponents 2^-60 .. 2^9 (subnormals and the tiny
  // tail are sampled separately below).
  for (let i = 0; i < 150_000 * scale; i += 1) add("log-uniform", randomDouble(rng, -60, 9));
  // Linear-uniform over the computed range, and per glibc branch.
  const top = fn === "tanh" ? 23 : 711;
  for (let i = 0; i < 50_000 * scale; i += 1) add("linear-uniform", rng() * top);
  for (let i = 0; i < 30_000 * scale; i += 1) add("near-zero", rng() * 1e-3);
  for (let i = 0; i < 30_000 * scale; i += 1) add("unit", rng() * 2);
  if (fn !== "tanh") {
    for (let i = 0; i < 30_000 * scale; i += 1) add("near-overflow", 700 + rng() * 11);
  } else {
    for (let i = 0; i < 30_000 * scale; i += 1) add("near-saturation", 15 + rng() * 8);
  }
  // Every region that computes, densely.
  let from = 0;
  for (const r of regions) {
    const to = Math.min(r.below, 800);
    if (r.path !== "direct" && from < to) {
      for (let i = 0; i < 100_000 * scale; i += 1) add("region", from + rng() * (to - from));
      // log-uniform within the region, for the regions spanning binades
      const lo = Math.max(from, 2 ** -60);
      for (let i = 0; i < 5_000 * scale; i += 1) add("region", lo * (to / lo) ** rng());
      for (const x of neighbours(from || Number.MIN_VALUE, 300 * scale)) add("region-edge", x);
    }
    from = r.below;
  }
  // Consecutive doubles either side of every branch point.
  for (const b of Object.values(branches)) {
    for (const x of neighbours(b, 1500 * scale)) add("branch", x);
  }
  // `expm1`'s own branch points (high words 0x3c900000, 0x3fd62e43,
  // 0x3ff0a2b2, 0x4043687a), at `|x|` for `sinh`/`cosh` and at `|x|/2` for
  // `tanh`, which calls it on `2|x|`.
  const expm1Branches = [2 ** -54, 0.3465735912322998, 1.0397205352783203, 38.81622314453125];
  for (const b of [
    2 ** -30,
    23,
    711,
    19.06,
    18.715,
    ...expm1Branches,
    ...expm1Branches.map((e) => e / 2),
  ]) {
    for (const x of neighbours(b, 500 * scale)) add("branch", x);
  }
  // Subnormals and the tiny tail.
  for (let i = 0; i < 2_000 * scale; i += 1) {
    add(
      "subnormal",
      fromBits(BigInt(Math.floor(rng() * 2 ** 32)) * BigInt(1 + Math.floor(rng() * 2 ** 20))),
    );
  }
  for (let i = 0; i < 5_000 * scale; i += 1) add("tiny", randomDouble(rng, -1022, -30));
  for (const x of HUMAN) add("human", x);
  for (const x of [0, Number.MIN_VALUE, 2 ** -1022, Infinity, Number.MAX_VALUE]) add("special", x);
  out.push({ category: "special", x: Number.NaN });
  return out;
}

// ------------------------------------------------------------------ ruby ---
/**
 * Ruby's own answers for each argument: `Math.<fn>`, and the gem's
 * reciprocal (`1.0 / Math.<fn>(x)`, or `"ZeroDivision"` where the gem's
 * `divide` raises).
 */
function rubyAnswers(fn, hexes) {
  const script = `
    require "json"
    abort "REFUSING: the oracle's Ruby is 4.0.1; this is #{RUBY_VERSION}" unless RUBY_VERSION == "4.0.1"
    xs = JSON.parse($stdin.read)
    out = xs.map do |h|
      x = [h].pack("H*").unpack1("G")
      y = Math.${fn}(x)
      r = y.zero? ? "ZeroDivision" : [1.0 / y.to_f].pack("G").unpack1("H*")
      [[y].pack("G").unpack1("H*"), r]
    end
    print JSON.generate(out)`;
  return new Promise((resolve, reject) => {
    const child = spawn("ruby", ["-e", script], { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c) => {
      out += c;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`ruby ${code}`)),
    );
    child.stdin.end(JSON.stringify(hexes));
  });
}

function runWorkers(outfile, fn, hexes) {
  const n = Math.max(1, cpus().length);
  const size = Math.ceil(hexes.length / n);
  const jobs = [];
  for (let i = 0; i < n; i += 1) {
    const slice = hexes.slice(i * size, (i + 1) * size);
    if (slice.length === 0) continue;
    jobs.push(
      new Promise((resolve, reject) => {
        const w = new Worker(fileURLToPath(import.meta.url), {
          workerData: { outfile, fn, hexes: slice },
        });
        w.on("message", resolve);
        w.on("error", reject);
      }),
    );
  }
  return Promise.all(jobs).then((parts) => parts.flat());
}

/** Stored rows per region and kind (answered, refused). */
const CORPUS_ROWS = 60;

// ------------------------------------------------------------------ main ---
/** Ruby's `Math.expm1` for each argument, as hex. */
function rubyExpm1(hexes) {
  const script = `
    require "json"
    abort "REFUSING: the oracle's Ruby is 4.0.1; this is #{RUBY_VERSION}" unless RUBY_VERSION == "4.0.1"
    xs = JSON.parse($stdin.read)
    print JSON.generate(xs.map { |h| [Math.expm1([h].pack("H*").unpack1("G"))].pack("G").unpack1("H*") })`;
  return new Promise((resolve, reject) => {
    const child = spawn("ruby", ["-e", script], { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c) => {
      out += c;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`ruby ${code}`)),
    );
    child.stdin.end(JSON.stringify(hexes));
  });
}

async function expm1Order() {
  const outfile = join(mkdtempSync(join(tmpdir(), "libm-expm1-")), "expm1.mjs");
  await build({
    entryPoints: [join(REPO_ROOT, "src/evaluation/libm-expm1.ts")],
    bundle: true,
    format: "esm",
    platform: "node",
    outfile,
    logLevel: "error",
  });
  const mod = await import(outfile);
  const rng = mulberry32(SEED + 17);
  const xs = [];
  const add = (x) => {
    if (Math.abs(x) < 44) xs.push(x, -x);
  };
  for (let i = 0; i < 1_000_000; i += 1) add(randomDouble(rng, -60, 5));
  for (let i = 0; i < 500_000; i += 1) add(rng() * 44);
  for (const b of [2 ** -54, 0.3465735912322998, 1.0397205352783203, 38.81622314453125]) {
    for (const x of neighbours(b, 3000)) add(x);
  }
  const ruby = [];
  for (let i = 0; i < xs.length; i += 200_000) {
    for (const h of await rubyExpm1(xs.slice(i, i + 200_000).map(hexOf))) ruby.push(h);
  }
  let split = 0;
  let horner = 0;
  for (let i = 0; i < xs.length; i += 1) {
    if (hexOf(mod.expm1(xs[i], mod.splitOrder)) !== ruby[i]) split += 1;
    if (hexOf(mod.expm1(xs[i], mod.hornerOrder)) !== ruby[i]) horner += 1;
  }
  console.log(
    `expm1 against Ruby Math.expm1, ${xs.length} arguments (seed ${SEED}): ` +
      `split order ${split} differ, Horner order ${horner} differ`,
  );
  process.exit(split === 0 ? 0 : 1);
}

if (isMainThread && process.version !== "v24.18.0") {
  console.error(`REFUSING: the measurement runs on Node v24.18.0; this is ${process.version}`);
  process.exit(1);
}

const glibcVersion = isMainThread ? process.report.getReport().header.glibcVersionRuntime : null;
if (isMainThread && glibcVersion !== "2.35") {
  console.error(`REFUSING: the oracle is glibc 2.35; this host runs glibc ${glibcVersion}`);
  process.exit(1);
}

if (isMainThread && process.argv.includes("--expm1-order")) {
  await expm1Order();
}

if (isMainThread) {
  const writeCorpus = process.argv.includes("--write-corpus");
  const scaleArg = process.argv.indexOf("--scale");
  const scale = scaleArg >= 0 ? Number(process.argv[scaleArg + 1]) : 1;
  const { outfile, module: mod } = await loadModule();
  let failed = false;
  const rubyVersion = await new Promise((resolve) => {
    const c = spawn("ruby", ["-v"]);
    let o = "";
    c.stdout.on("data", (d) => {
      o += d;
    });
    c.on("close", () => resolve(o.trim()));
  });
  const corpus = {
    $comment: "GENERATED by scripts/measure-libm-hyperbolic-glibc.mjs --write-corpus. Do not edit.",
    seed: SEED,
    scale,
    platform: {
      node: process.version,
      arch: process.arch,
      os: process.platform,
      ruby: rubyVersion,
      libc: `glibc ${glibcVersion}`,
    },
    functions: {},
  };

  for (const fn of FUNCTIONS) {
    const samples = hyperbolicSamples(fn, mod.BRANCH, scale, mod.REGIONS[fn]);
    const hexes = samples.map((s) => hexOf(s.x));
    const [ruby, rows] = await Promise.all([
      rubyAnswers(fn, hexes),
      runWorkers(outfile, fn, hexes),
    ]);
    const regions = new Map(
      mod.REGIONS[fn].map((r) => [
        r.name,
        { r, n: 0, refused: 0, answeredRows: [], refusedRows: [] },
      ]),
    );
    const categories = new Map();
    let mismatches = 0;
    let recipMismatches = 0;
    const mismatchList = [];
    for (let i = 0; i < samples.length; i += 1) {
      const { x, category } = samples[i];
      const answered = rows[i];
      const [glibc, recip] = ruby[i];
      const region = regions.get(mod.regionFor(fn, x).name);
      region.n += 1;
      const cat = categories.get(category) ?? { n: 0, refused: 0 };
      categories.set(category, cat);
      cat.n += 1;
      const row = [hexOf(x), glibc, recip];
      if (answered === null) {
        region.refused += 1;
        cat.refused += 1;
        if (region.refusedRows.length < CORPUS_ROWS) region.refusedRows.push(row);
        continue;
      }
      const glibcIsNaN = Number.isNaN(fromBits(BigInt(`0x${glibc}`)));
      if (answered !== glibc && !(glibcIsNaN && Number.isNaN(fromBits(BigInt(`0x${answered}`))))) {
        mismatches += 1;
        mismatchList.push({ x: hexOf(x), answered, glibc });
        continue;
      }
      // The reciprocal: IEEE division of the same operand.
      const y = fromBits(BigInt(`0x${answered}`));
      const port = y === 0 ? "ZeroDivision" : hexOf(1 / y);
      if (port !== recip) recipMismatches += 1;
      if (region.answeredRows.length < CORPUS_ROWS || category === "special")
        region.answeredRows.push(row);
    }

    console.log(`\n== ${fn}: ${samples.length} samples (seed ${SEED}, scale ${scale})`);
    const regionReport = [];
    for (const { r, n, refused, answeredRows, refusedRows } of regions.values()) {
      // Only an `exp` call can refuse; a region that makes none must answer all.
      const ok = refused === 0 || r.path === "exp" || r.path === "exp-half";
      if (!ok) failed = true;
      console.log(
        `  ${r.name.padEnd(46)} ${r.path.padEnd(8)} n=${String(n).padStart(8)}` +
          ` refused=${refused} (${((100 * refused) / Math.max(1, n)).toFixed(3)}%)` +
          `${ok ? "" : "  <-- FAIL"}`,
      );
      regionReport.push({ name: r.name, path: r.path, n, refused, answeredRows, refusedRows });
    }
    for (const [category, { n, refused }] of categories) {
      console.log(
        `  category ${category.padEnd(16)} n=${n} refused=${refused} (${((100 * refused) / n).toFixed(3)}%)`,
      );
    }
    const refusedCount = [...regions.values()].reduce((s, r) => s + r.refused, 0);
    const answeredCount = samples.length - refusedCount;
    console.log(
      `  differential: ${answeredCount} answered, ${refusedCount} refused ` +
        `(${((100 * refusedCount) / samples.length).toFixed(3)}%), ${mismatches} differ from Ruby Math.${fn}; ` +
        `reciprocal ${recipMismatches} differ`,
    );
    for (const m of mismatchList.slice(0, 10))
      console.log(`    MISMATCH x=${m.x} port=${m.answered} ruby=${m.glibc}`);
    if (mismatches > 0 || recipMismatches > 0) failed = true;
    corpus.functions[fn] = {
      samples: samples.length,
      answered: answeredCount,
      refused: refusedCount,
      mismatches,
      reciprocalMismatches: recipMismatches,
      categories: Object.fromEntries(categories),
      regions: regionReport,
    };
  }
  if (writeCorpus) {
    const path = join(REPO_ROOT, "test/evaluation/libm-hyperbolic-corpus.json");
    writeFileSync(path, `${JSON.stringify(corpus)}\n`);
    console.log(`wrote ${path}`);
  }
  process.exit(failed ? 1 : 0);
}
