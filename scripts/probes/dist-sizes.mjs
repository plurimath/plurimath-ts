#!/usr/bin/env node
/**
 * Built-artifact size probe (TODO.plan/p2-output-formats/04-symbol-data.md).
 *
 * The package-isolation gate proves which modules a subpath's artifact
 * contains; it asserts nothing about how many bytes they are. This probe
 * measures that, because a generated symbol table is atomic for a bundler —
 * importing one row pulls in the whole ReadonlyMap, and "sideEffects": false
 * cannot drop the rest.
 *
 * It reports two numbers per subpath and module system:
 *
 *   entryBytes    the entry file alone, as `wc -c` would report it
 *   closureBytes  the entry plus every shared chunk it imports, which is what
 *                 a consumer actually downloads. Reporting only the entry
 *                 understates a subpath badly: tsdown puts the core layer in a
 *                 shared chunk, so `dist/latex.js` names roughly half its own
 *                 cost in a `from "./core-<hash>.js"` line.
 *
 * The closure is measured the way scripts/gate-package.mjs inspects the same
 * artifacts: re-bundle the built entry with esbuild and weigh the result.
 *
 * Run `pnpm build` first, then:
 *
 *   node scripts/probes/dist-sizes.mjs
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const closureBytes = async (entry, format) => {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format,
    platform: format === "cjs" ? "node" : "neutral",
    logLevel: "silent",
  });
  return result.outputFiles.reduce((sum, file) => sum + file.contents.length, 0);
};

const subpaths = {};
for (const [subpath, conditions] of Object.entries(pkg.exports)) {
  if (subpath === "./package.json") continue;
  const esm = join(root, conditions.import.default);
  const cjs = join(root, conditions.require.default);
  subpaths[subpath] = {
    esmEntryBytes: statSync(esm).size,
    esmClosureBytes: await closureBytes(esm, "esm"),
    cjsEntryBytes: statSync(cjs).size,
    cjsClosureBytes: await closureBytes(cjs, "cjs"),
  };
}

// The unminified source tables, for the same reason: they are the input whose
// growth the closure numbers above are expected to track.
const generatedRoot = join(root, "src", "generated");
const sourceTables = {};
for (const format of readdirSync(generatedRoot).sort()) {
  const file = join(generatedRoot, format, "symbols.ts");
  try {
    sourceTables[`src/generated/${format}/symbols.ts`] = statSync(file).size;
  } catch {
    // a format slice without a symbols.ts is not an error here
  }
}

console.log(JSON.stringify({ sourceTables, subpaths }, null, 2));
