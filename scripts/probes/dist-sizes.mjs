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
 *                 understates a subpath: tsdown puts the core layer in a shared
 *                 chunk that `dist/latex.js` names in a
 *                 `from "./core-<hash>.js"` line. Measured on this branch, that
 *                 chunk adds 28,045 bytes to latex's 121,525-byte ESM entry --
 *                 about a fifth of the 149,570-byte closure.
 *
 * The closure is measured the way scripts/gate-package.mjs inspects the same
 * artifacts: re-bundle the built entry with esbuild and weigh the result.
 *
 * Builds first itself (`buildFresh`), so a stale `dist` cannot be measured by
 * accident. Just run:
 *
 *   node scripts/probes/dist-sizes.mjs
 */

import { spawnSync } from "node:child_process";
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

// A size is only meaningful for artifacts that match the source it claims to
// describe, and a timestamp cannot establish that. An mtime check has both
// failure modes: a fresh checkout can make unchanged sources newer than valid
// artifacts and raise a false alarm, and a build that rewrote only the exported
// entries leaves shared chunks stale while every entry looks current — the
// closure is measured through those chunks, so that one passes while being
// wrong.
//
// So this does not inspect `dist/`; it builds first and measures what it built.
// Measurement and build become one step and the question stops existing.
const buildFresh = () => {
  const result = spawnSync("pnpm", ["build"], { cwd: root, encoding: "utf8" });
  if (result.error) {
    throw new Error(`could not run \`pnpm build\`: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `\`pnpm build\` exited ${result.status}. This probe measures a build it made itself, ` +
        `so it will not fall back to whatever dist/ happens to hold.\n${result.stderr ?? ""}`,
    );
  }
};

buildFresh();

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
