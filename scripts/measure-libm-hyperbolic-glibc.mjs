#!/usr/bin/env node
// Sizes `src/evaluation/libm-hyperbolic.ts`'s refusal bands from where
// glibc's `sinh`, `cosh` and `tanh` (through the oracle's Ruby `Math`) actually
// miss the correctly rounded double, per argument region, and runs the
// differential of the port (bands on) against Ruby's `Math` for `sinh`,
// `cosh`, `tanh` and the gem's `sech`/`csch`/`coth` (`1.0 / Math.cosh(x)`,
// and so on, raising `DivisionByZeroError` on a zero).
//
//   mise x -- node scripts/measure-libm-hyperbolic-glibc.mjs [--write-corpus] [--scale N]
//
// Requires `ruby` on PATH — the oracle's Ruby, whose `Math.sinh` is glibc's.
//
// The exact value is the port's own `BigInt` computation (`exactHyperbolic`);
// `--reference N` also checks the correctly rounded double of `N` samples per
// function against `scripts/lib/libm-reference.rb` (BigDecimal), so the
// port's arithmetic is checked independently of itself.
//
// Per function and region (`REGIONS`), over the seeded sample
// (`hyperbolicSamples` below: log-uniform and linear-uniform arguments, both
// signs, thousands of consecutive doubles either side of every glibc branch
// point and of the overflow threshold, subnormals, hand-typed values, zeros,
// infinities and NaN), it prints: how often glibc returns the correctly
// rounded double; the worst miss's distance from the midpoint (in ULP); any
// "far" miss (glibc not one of the two doubles around the exact value), which
// no band can fix; the band `2 * worst`, and the region's configured band.
// It exits nonzero if a configured band is narrower than twice the worst
// miss, if a far miss lies in a region that is not wholly refused, or if the
// differential finds one answered input where the port differs from Ruby.

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
const subArg = process.argv.indexOf("--binades");
const SUB =
  subArg >= 0 && /^\d+$/.test(process.argv[subArg + 1] ?? "")
    ? Number(process.argv[subArg + 1])
    : 1;
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
    const exact = mod.exactHyperbolic(fn, x);
    const nearest = mod.roundHyperbolic(exact, null);
    const pos = mod.midpointOffset(exact);
    let answered = null;
    try {
      answered = mod.hyperbolic(fn, x);
    } catch {
      answered = null;
    }
    // below / above: the doubles either side of the exact value.
    let lower = null;
    let upper = null;
    let distance = null;
    if (pos !== null) {
      const a = Math.abs(nearest);
      const nextUp = fromBits(bitsOf(a) + 1n);
      const nextDown = a === 0 ? 0 : fromBits(bitsOf(a) - 1n);
      // offset > 0: exact above the midpoint, nearest is the upper double.
      const [lo, hi] = pos.offset > 0n ? [nextDown, a] : [a, nextUp];
      lower = exact.negative ? -hi : lo;
      upper = exact.negative ? -lo : hi;
      const off = pos.offset < 0n ? -pos.offset : pos.offset;
      // |offset| / (2 full), to 1e-9 ULP.
      distance = Number((off * 1_000_000_000n) / (2n * pos.full)) / 1e9;
    }
    rows.push([
      hexOf(nearest),
      lower === null ? null : hexOf(lower),
      upper === null ? null : hexOf(upper),
      distance,
      answered === null ? null : hexOf(answered),
    ]);
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
  // Log-uniform over every exponent a result can have: 2^-1074 .. 2^9.
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
  // Every region with a band, densely, so its worst miss is well sampled.
  let from = 0;
  for (const r of regions) {
    const to = Math.min(r.below, 800);
    if (r.inverse !== null && from < to) {
      for (let i = 0; i < 100_000 * scale; i += 1) add("banded-region", from + rng() * (to - from));
      // log-uniform within the region, for the regions spanning binades
      const lo = Math.max(from, 2 ** -60);
      for (let i = 0; i < 5_000 * scale; i += 1) add("banded-region", lo * (to / lo) ** rng());
      for (const x of neighbours(from || Number.MIN_VALUE, 300 * scale)) add("region-edge", x);
    }
    from = r.below;
  }
  // Consecutive doubles either side of every branch point.
  for (const b of Object.values(branches)) {
    for (const x of neighbours(b, 1500 * scale)) add("branch", x);
  }
  for (const b of [2 ** -30, 23, 711, 19.06, 18.715]) {
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

/** The BigDecimal reference (`scripts/lib/libm-reference.rb`): `[glibc, correctly rounded, distance]` rows. */
function bigDecimalReference(fn, hexes) {
  return new Promise((resolve, reject) => {
    const child = spawn("ruby", [join(HERE, "lib", "libm-reference.rb"), fn], {
      stdio: ["pipe", "pipe", "inherit"],
    });
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

/** Stored rows per region and kind (answered, refused, glibc miss). */
const CORPUS_ROWS = 60;
/** Arguments per function checked against the BigDecimal reference, besides every glibc miss. */
const REFERENCE_COUNT = 6_000;

// ------------------------------------------------------------------ main ---
if (isMainThread) {
  const glibcVersion = process.report.getReport().header.glibcVersionRuntime;
  if (glibcVersion !== "2.35") {
    console.error(`REFUSING: the oracle is glibc 2.35; this host runs glibc ${glibcVersion}`);
    process.exit(1);
  }
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
        {
          r,
          n: 0,
          miss: 0,
          far: 0,
          worst: 0,
          worstX: null,
          refused: 0,
          farX: null,
          answeredRows: [],
          refusedRows: [],
          missRows: [],
        },
      ]),
    );
    const categories = new Map();
    let mismatches = 0;
    let recipMismatches = 0;
    const mismatchList = [];
    const binades = new Map();
    const referenceIndexes = [];
    const stride = Math.max(1, Math.floor(samples.length / REFERENCE_COUNT));
    for (let i = 0; i < samples.length; i += 1) {
      const { x, category } = samples[i];
      const [nearest, lower, upper, distance, answered] = rows[i];
      const [glibc, recip] = ruby[i];
      const region = regions.get(mod.regionFor(fn, x).name);
      region.n += 1;
      const binade =
        x === 0 || !Number.isFinite(x)
          ? null
          : Math.max(-80, Math.floor(Math.log2(Math.abs(x)) * SUB) / SUB);
      const bin =
        binade === null ? null : (binades.get(binade) ?? { n: 0, worst: 0, far: 0, miss: 0 });
      if (bin) binades.set(binade, bin);
      if (bin) bin.n += 1;
      const cat = categories.get(category) ?? { n: 0, refused: 0 };
      categories.set(category, cat);
      cat.n += 1;
      const glibcIsNaN = Number.isNaN(fromBits(BigInt(`0x${glibc}`)));
      let missed = false;
      if (glibc !== nearest && !(glibcIsNaN && Number.isNaN(fromBits(BigInt(`0x${nearest}`))))) {
        missed = true;
        region.miss += 1;
        if (bin) bin.miss += 1;
        if (distance !== null && (glibc === lower || glibc === upper)) {
          if (bin) bin.worst = Math.max(bin.worst, distance);
          if (distance >= region.worst) {
            region.worst = distance;
            region.worstX = hexOf(x);
          }
        } else {
          if (bin) bin.far += 1;
          region.far += 1;
          region.farX = hexOf(x);
        }
        if (region.r.band !== null) referenceIndexes.push(i);
      }
      if (i % stride === 0) referenceIndexes.push(i);
      const row = [hexOf(x), glibc, recip];
      if (answered === null) {
        region.refused += 1;
        cat.refused += 1;
        if (missed && region.missRows.length < CORPUS_ROWS) region.missRows.push(row);
        else if (region.refusedRows.length < CORPUS_ROWS) region.refusedRows.push(row);
      } else if (
        answered !== glibc &&
        !(glibcIsNaN && Number.isNaN(fromBits(BigInt(`0x${answered}`))))
      ) {
        mismatches += 1;
        mismatchList.push({ x: hexOf(x), answered, glibc });
      } else {
        // The reciprocal: IEEE division of the same operand.
        const y = fromBits(BigInt(`0x${answered}`));
        const port = y === 0 ? "ZeroDivision" : hexOf(1 / y);
        if (port !== recip) recipMismatches += 1;
        if (region.answeredRows.length < CORPUS_ROWS || category === "special")
          region.answeredRows.push(row);
      }
    }

    // The port's correctly rounded double against the BigDecimal reference.
    const refHexes = [...new Set(referenceIndexes)].map((i) => hexes[i]);
    const refIndex = new Map(hexes.map((h, i) => [h, i]));
    const reference = await bigDecimalReference(fn, refHexes);
    let referenceDisagreements = 0;
    for (let k = 0; k < refHexes.length; k += 1) {
      const [, cr] = reference[k];
      const [nearest] = rows[refIndex.get(refHexes[k])];
      if (cr === null) continue;
      if (cr !== nearest) {
        referenceDisagreements += 1;
        console.log(`    REFERENCE x=${refHexes[k]} port=${nearest} bigdecimal=${cr}`);
      }
    }
    if (referenceDisagreements > 0) failed = true;

    console.log(`\n== ${fn}: ${samples.length} samples (seed ${SEED}, scale ${scale})`);
    const regionReport = [];
    for (const {
      r,
      n,
      miss,
      far,
      worst,
      worstX,
      refused,
      farX,
      answeredRows,
      refusedRows,
      missRows,
    } of regions.values()) {
      const configured = r.inverse === null ? "refused" : `1/${r.inverse}`;
      const configuredRadius = r.inverse === null ? Infinity : 1 / Number(r.inverse);
      const ok = r.inverse === null || (far === 0 && configuredRadius >= 2 * worst);
      if (!ok) failed = true;
      console.log(
        `  ${r.name.padEnd(44)} n=${String(n).padStart(8)} misses=${String(miss).padStart(6)} far=${far}` +
          ` worst=${worst.toFixed(6)} ULP (x=${worstX}) band=${configured}` +
          ` refused=${refused} (${((100 * refused) / Math.max(1, n)).toFixed(3)}%)${farX ? ` farX=${farX}` : ""}` +
          `${ok ? "" : "  <-- FAIL"}`,
      );
      regionReport.push({
        name: r.name,
        band: r.inverse === null ? null : Number(r.inverse),
        n,
        misses: miss,
        far,
        worstMidpointDistance: worst,
        worstArgument: worstX,
        refused,
        answeredRows,
        refusedRows,
        missRows,
      });
    }
    if (process.argv.includes("--binades")) {
      for (const [e, b] of [...binades].sort((p, q) => p[0] - q[0])) {
        console.log(
          `  binade 2^${e.toFixed(3)} (${(2 ** e).toPrecision(6)}): n=${b.n} misses=${b.miss} far=${b.far} worst=${b.worst.toFixed(6)}`,
        );
      }
    }
    for (const [category, { n, refused }] of categories) {
      console.log(
        `  category ${category.padEnd(16)} n=${n} refused=${refused} (${((100 * refused) / n).toFixed(3)}%)`,
      );
    }
    const answeredCount = samples.length - [...regions.values()].reduce((s, r) => s + r.refused, 0);
    console.log(
      `  differential: ${answeredCount} answered, ${mismatches} differ from Ruby Math.${fn}; ` +
        `reciprocal ${recipMismatches} differ; BigDecimal reference ${refHexes.length} checked, ${referenceDisagreements} differ`,
    );
    for (const m of mismatchList.slice(0, 10))
      console.log(`    MISMATCH x=${m.x} port=${m.answered} ruby=${m.glibc}`);
    if (mismatches > 0 || recipMismatches > 0) failed = true;
    corpus.functions[fn] = {
      samples: samples.length,
      answered: answeredCount,
      mismatches,
      reciprocalMismatches: recipMismatches,
      referenceChecked: refHexes.length,
      referenceDisagreements,
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
