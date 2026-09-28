#!/usr/bin/env node
// Differential check of `src/evaluation/libm-log2.ts` (Arm optimized-routines'
// `log2`) and `libm-log10.ts` (fdlibm's `log10`), through `libm.ts`'s
// `Math.log10` and two-argument `Math.log` wrappers, against the C library
// the oracle's Ruby calls (glibc 2.35 on the oracle's host): bit for bit, on
// seeded samples.
//
//   node scripts/measure-libm-log-glibc.mjs [--write-corpus]
//
// Requires `ruby` on PATH — the oracle's own Ruby, 4.0.1 (checked; older
// Rubies compute `Math.log(x, base)` differently), since what is compared is
// the platform C library its `Math` module calls, not anything the plurimath
// gem provides.
//
// For each function it prints, per sample category, how many arguments were
// compared, how many the port answered differently from glibc (which must be
// none), and, for `log10`, how many it refused (`libm.ts`'s `glibcLog10`:
// inside `log`'s band, where glibc's `log` and its neighbours disagree). It
// exits 1 on any mismatch.
//
// `libm.ts` is loaded through `esbuild` from the checked-out source, never
// from `dist/`, as `measure-libm-glibc-accuracy.mjs` does.
//
// `--write-corpus` writes `test/evaluation/libm-log-corpus.json`: the
// platform (Ruby, glibc, whether the CPU has FMA), the figures, and the first 300 arguments of every category with glibc's
// answer, plus up to 300 the port refused, which
// `test/evaluation/libm-log-corpus.spec.ts` re-checks on every run without
// Ruby.

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..");
const writeCorpus = process.argv.includes("--write-corpus");

const SEED = 20260928n;
const UNIFORM_COUNT = 200_000;
const PAIR_COUNT = 200_000;
const CORPUS_ROWS = 300;

// The oracle is glibc 2.35's `Math`: refuse to label anything else as it.
const glibcVersion = process.report.getReport().header.glibcVersionRuntime;
if (glibcVersion !== "2.35") {
  console.error(`REFUSING: the oracle is glibc 2.35; this host runs glibc ${glibcVersion}`);
  process.exit(1);
}

const outdir = mkdtempSync(join(tmpdir(), "libm-log-measure-"));
await build({
  entryPoints: {
    libm: join(REPO_ROOT, "src/evaluation/libm.ts"),
    log2: join(REPO_ROOT, "src/evaluation/libm-log2.ts"),
  },
  bundle: true,
  format: "esm",
  platform: "node",
  outdir,
  outExtension: { ".js": ".mjs" },
  logLevel: "error",
});
const { mathLog10, mathLogBase } = await import(join(outdir, "libm.mjs"));
const { log2 } = await import(join(outdir, "log2.mjs"));

const view = new DataView(new ArrayBuffer(8));
function hexOf(x) {
  view.setFloat64(0, x);
  return view.getBigUint64(0).toString(16).padStart(16, "0");
}
function fromHex(hex) {
  view.setBigUint64(0, BigInt(`0x${hex}`));
  return view.getFloat64(0);
}

/** splitmix64, seeded: the sample is the same on every run. */
let state = SEED;
function next64() {
  state = (state + 0x9e3779b97f4a7c15n) & 0xffffffffffffffffn;
  let z = state;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & 0xffffffffffffffffn;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & 0xffffffffffffffffn;
  return z ^ (z >> 31n);
}
/** A uniform double in `[0, 1)`. */
function unit() {
  return Number(next64() >> 11n) / 2 ** 53;
}
function below(n) {
  return Number(next64() % BigInt(n));
}

/** A positive finite double from a uniform bit pattern (subnormals included). */
function uniformBits() {
  return fromHex((next64() % 0x7ff0000000000000n).toString(16).padStart(16, "0"));
}
function nearOne() {
  return 1 + (unit() * 2 - 1) * 0.0625;
}
function human() {
  return (1 + below(10 ** (1 + below(8)))) / 10 ** below(7);
}

function argumentSamples() {
  const categories = { uniform: [], "near-one": [], human: [], powers: [], edges: [] };
  for (let n = 0; n < UNIFORM_COUNT; n++) categories.uniform.push(uniformBits());
  for (let n = 0; n < UNIFORM_COUNT / 4; n++) categories["near-one"].push(nearOne());
  for (let n = 0; n < UNIFORM_COUNT / 4; n++) categories.human.push(human());
  for (let e = -1074; e <= 1023; e++) {
    const x = 2 ** e;
    categories.powers.push(x, fromHex((BigInt(`0x${hexOf(x)}`) + 1n).toString(16)));
    if (e > -1074) categories.powers.push(fromHex((BigInt(`0x${hexOf(x)}`) - 1n).toString(16)));
  }
  for (let e = -323; e <= 308; e++) {
    const x = Number(`1e${e}`);
    if (x === 0 || !Number.isFinite(x)) continue;
    const bits = BigInt(`0x${hexOf(x)}`);
    categories.powers.push(x, fromHex((bits + 1n).toString(16)), fromHex((bits - 1n).toString(16)));
  }
  categories.edges.push(
    0,
    -0,
    Number.MIN_VALUE,
    Number.MAX_VALUE,
    2 ** -1022,
    1,
    2,
    10,
    Infinity,
    NaN,
  );
  return categories;
}

function pairSamples() {
  const pick = () =>
    [uniformBits, () => unit() * 2 ** (below(2098) - 1074), nearOne, human][below(4)]();
  const pairs = { mixed: [], edges: [] };
  while (pairs.mixed.length < PAIR_COUNT) {
    const x = pick();
    const b = pick();
    if (b !== 1) pairs.mixed.push([x, b]);
  }
  const bases = [2, 10, Math.E, 0.5, 3, 1 + 2 ** -52, 1 - 2 ** -53, Infinity, Number.MIN_VALUE];
  const xs = [0, -0, 1, 2, 8, 10, 100, 1000, 1e300, Number.MIN_VALUE, Infinity, NaN, 1 + 2 ** -52];
  for (const b of bases) for (const x of xs) pairs.edges.push([x, b]);
  return pairs;
}

const RUBY = `
abort "REFUSING: need the oracle's Ruby 4.0.1, not #{RUBY_VERSION}" unless RUBY_VERSION == "4.0.1"
STDOUT.sync = false
h = ->(f) { [f].pack("G").unpack1("H*") }
d = ->(s) { [s.to_i(16)].pack("Q>").unpack1("G") }
STDIN.each_line do |line|
  fn, a, b = line.split
  r = case fn
      when "log2" then Math.log2(d.(a))
      when "log10" then Math.log10(d.(a))
      else Math.log(d.(a), d.(b))
      end
  puts h.(r)
end
`;

/** glibc's answers for `lines` ("fn xhex [bhex]"), from one Ruby process. */
function glibc(lines) {
  return new Promise((resolve, reject) => {
    const child = spawn("ruby", ["-e", RUBY], { stdio: ["pipe", "pipe", "inherit"] });
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`ruby exited ${code}`));
      else resolve(Buffer.concat(chunks).toString("utf8").trim().split("\n"));
    });
    child.stdin.end(`${lines.join("\n")}\n`);
  });
}

function same(port, expectedHex) {
  return hexOf(port) === expectedHex || (Number.isNaN(port) && Number.isNaN(fromHex(expectedHex)));
}

/** The port's answer, or `null` when it refuses (`UnsupportedFeatureError`). */
function answer(run) {
  try {
    return run();
  } catch (error) {
    if (error?.constructor?.name === "UnsupportedFeatureError") return null;
    throw error;
  }
}

const summary = {};
const corpus = { log2: {}, log10: {}, logBase: {} };
let mismatches = 0;

const numeric = (x) => ({ kind: "float", value: x });

const args = argumentSamples();
for (const [category, xs] of Object.entries(args)) {
  const log2Answers = await glibc(xs.map((x) => `log2 ${hexOf(x)}`));
  const log10Answers = await glibc(xs.map((x) => `log10 ${hexOf(x)}`));
  const s2 = { n: xs.length, mismatches: 0 };
  const s10 = { n: xs.length, mismatches: 0, refused: 0 };
  const rows2 = [];
  const rows10 = [];
  const refusedRows = [];
  xs.forEach((x, i) => {
    const g2 = log2Answers[i];
    const g10 = log10Answers[i];
    if (!same(log2(x), g2)) {
      s2.mismatches++;
      console.error(`log2 mismatch: x=${hexOf(x)} port=${hexOf(log2(x))} glibc=${g2}`);
    }
    const r10 = answer(() => mathLog10(numeric(x)));
    if (r10 === null) {
      s10.refused++;
      if (refusedRows.length < CORPUS_ROWS) refusedRows.push([hexOf(x), g10]);
    } else if (!same(r10, g10)) {
      s10.mismatches++;
      console.error(`log10 mismatch: x=${hexOf(x)} port=${hexOf(r10)} glibc=${g10}`);
    }
    if (rows2.length < CORPUS_ROWS) rows2.push([hexOf(x), g2]);
    if (r10 !== null && rows10.length < CORPUS_ROWS) rows10.push([hexOf(x), g10]);
  });
  mismatches += s2.mismatches + s10.mismatches;
  summary[`log2 ${category}`] = s2;
  summary[`log10 ${category}`] = s10;
  corpus.log2[category] = rows2;
  corpus.log10[category] = rows10;
  corpus.log10[`${category} refused`] = refusedRows;
}

const pairs = pairSamples();
for (const [category, list] of Object.entries(pairs)) {
  const answers = await glibc(list.map(([x, b]) => `log ${hexOf(x)} ${hexOf(b)}`));
  const s = { n: list.length, mismatches: 0 };
  const rows = [];
  list.forEach(([x, b], i) => {
    const port = mathLogBase(numeric(x), numeric(b));
    if (!same(port, answers[i])) {
      s.mismatches++;
      console.error(
        `log mismatch: x=${hexOf(x)} b=${hexOf(b)} port=${hexOf(port)} glibc=${answers[i]}`,
      );
    }
    if (rows.length < CORPUS_ROWS) rows.push([hexOf(x), hexOf(b), answers[i]]);
  });
  mismatches += s.mismatches;
  summary[`log(x, base) ${category}`] = s;
  corpus.logBase[category] = rows;
}

console.table(summary);

if (writeCorpus && mismatches === 0) {
  const path = join(REPO_ROOT, "test/evaluation/libm-log-corpus.json");
  const payload = {
    $comment: "GENERATED by scripts/measure-libm-log-glibc.mjs --write-corpus. Do not edit.",
    seed: Number(SEED),
    platform: {
      node: process.version,
      arch: process.arch,
      os: process.platform,
      ruby: execFileSync("ruby", ["-e", "print RUBY_DESCRIPTION"], { encoding: "utf8" }),
      libc: `glibc ${glibcVersion}`,
      cpuFma: readFileSync("/proc/cpuinfo", "utf8").includes(" fma "),
    },
    summary,
    ...corpus,
  };
  writeFileSync(path, `${JSON.stringify(payload)}\n`);
  console.log(`wrote ${path}`);
}

process.exit(mismatches === 0 ? 0 : 1);
