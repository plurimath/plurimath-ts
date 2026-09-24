#!/usr/bin/env node
// Measures what `evaluate()`'s `evaluationMaxIterations: null` costs: an
// uncapped `Sum` runs one body evaluation per step, so its time grows
// linearly with the range, without bound, as `src/evaluation/index.ts`'s
// `EvaluationOptions` states. The gem's `nil` cap behaves the same. The
// timings are this host's, under its current load: they vary between runs
// and machines (runs under the same Node 20.20.2 on this host have differed
// by two to three times), so they show the linear growth, not a fixed cost.
//
//   node scripts/measure-uncapped-iteration.mjs
//
// `evaluate` is loaded through `esbuild` from the checked-out source. Prints
// the median, minimum and maximum of five runs of `sum_(i=1)^N 1` for each N.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(join(tmpdir(), "uncapped-"));
const entry = join(dir, "entry.ts");
writeFileSync(
  entry,
  `export { evaluate } from ${JSON.stringify(join(REPO_ROOT, "src/evaluation/index.ts"))};\n` +
    `export { parseAsciimath } from ${JSON.stringify(join(REPO_ROOT, "src/formats/asciimath/index.ts"))};\n`,
);
const outfile = join(dir, "bundle.mjs");
await build({
  entryPoints: [entry],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile,
  logLevel: "error",
});
const { evaluate, parseAsciimath } = await import(outfile);

console.log(`node ${process.version}, ${process.platform} ${process.arch}`);
for (const n of [100_000, 1_000_001, 2_000_001]) {
  const formula = parseAsciimath(`sum_(i=1)^${n} 1`);
  const times = [];
  let value = 0;
  for (let run = 0; run < 5; run += 1) {
    const started = performance.now();
    value = evaluate(formula, {}, { evaluationMaxIterations: null });
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  console.log(
    `sum_(i=1)^${n} 1 = ${value}: median ${times[2].toFixed(0)} ms ` +
      `(min ${times[0].toFixed(0)}, max ${times[4].toFixed(0)})`,
  );
}
