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

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

// A size measured from artifacts older than the source they claim to describe
// is worse than no size, because it reads as a real number. `dist/` is not
// tracked, so there is nothing to compare a hash against; what this can do is
// refuse to measure artifacts that are absent or older than the newest source
// file, and say plainly which it hit.
const newestSourceMtime = () => {
  let newest = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|mjs|json)$/.test(entry.name)) {
        const m = statSync(full).mtimeMs;
        if (m > newest) newest = m;
      }
    }
  };
  walk(join(root, "src"));
  return newest;
};

const subpaths = {};
const sourceMtime = newestSourceMtime();
for (const [subpath, conditions] of Object.entries(pkg.exports)) {
  if (subpath === "./package.json") continue;
  const esm = join(root, conditions.import.default);
  const cjs = join(root, conditions.require.default);
  for (const artifact of [esm, cjs]) {
    if (!existsSync(artifact)) {
      throw new Error(
        `${artifact} is missing. Run \`pnpm build\` first: this probe measures built ` +
          "artifacts and will not invent a number for one that is not there.",
      );
    }
    if (statSync(artifact).mtimeMs < sourceMtime) {
      throw new Error(
        `${artifact} is older than the newest file under src/. Run \`pnpm build\` first: ` +
          "a size measured from stale artifacts describes a tree that no longer exists.",
      );
    }
  }
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
