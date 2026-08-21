#!/usr/bin/env node
/**
 * Package-isolation gate (ARCHITECTURE.md §3, §7).
 *
 * Source-level import rules and "sideEffects": false do not prove what ships.
 * This gate builds, packs, and then inspects the real artifacts:
 *
 *   1. every published subpath loads under ESM and CJS with its named exports
 *   2. each subpath's bundled graph contains only what it is allowed to
 *   3. publint passes on the built dist, and attw on a real `npm pack`
 *
 * The subpath list is read from package.json#exports, so a new format is
 * enumerated automatically — but its expected exports and forbidden layers are
 * hand-listed below, and a subpath absent from those tables silently skips both
 * assertions. Adding a format means adding it there. The root default export is asserted only once the compat class
 * exists (§4) — it is deliberately absent at P0.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const require = createRequire(import.meta.url);

const run = (command) => {
  const result = spawnSync(command, { cwd: root, shell: true, stdio: "inherit" });
  return result.status === 0;
};

/**
 * Entries a subpath must never pull in, keyed by subpath — the slim-bundle
 * guarantee of ARCHITECTURE.md §3, checked against the built `dist` and its
 * sourcemaps rather than against import statements. Only the attw step below
 * runs against a real `npm pack`.
 *
 * A consumer who reads AsciiMath should not pay for the LaTeX or MathML
 * renderers, and one who renders LaTeX should not pay for a parser at all.
 * `pegkit` is the parser combinator library: only `/asciimath` has an input
 * side today, so only it may carry pegkit. `xml` is the Ox-compatible
 * serializer, needed by MathML alone.
 */
/**
 * What each subpath must export, asserted against the BUILT artifact.
 *
 * `test/formats/subpath-surface.spec.ts` pins the same surface from `src/`,
 * which proves the barrels are right and nothing more: a miswired export map
 * or tsdown entry would ship the wrong file while that spec stayed green.
 * This is the artifact-side half — it resolves the subpath exactly as a
 * consumer would.
 */
const EXPECTED_EXPORTS = {
  "./asciimath": ["parseAsciimath", "toAsciimath"],
  "./latex": ["toLatex"],
  "./mathml": ["toMathml"],
  "./unicodemath": ["toUnicodemath"],
};

const FORBIDDEN = {
  "./core": [/formats\//, /pegkit\//],
  "./asciimath": [/formats\/latex\//, /formats\/mathml\//, /formats\/unicodemath\//, /xml\//],
  "./latex": [
    /formats\/asciimath\//,
    /formats\/mathml\//,
    /formats\/unicodemath\//,
    /pegkit\//,
    /xml\//,
  ],
  "./mathml": [/formats\/asciimath\//, /formats\/latex\//, /formats\/unicodemath\//, /pegkit\//],
  // UnicodeMath is text output like latex, so it needs no XML layer and no
  // grammar — its graph is core plus its own generated slice, nothing else.
  "./unicodemath": [
    /formats\/asciimath\//,
    /formats\/latex\//,
    /formats\/mathml\//,
    /pegkit\//,
    /xml\//,
  ],
};

const failures = [];
const fail = (message) => {
  console.log(`  ✗ ${message}`);
  failures.push(message);
};

console.log("building…");
if (!run("pnpm build")) {
  console.error("build failed");
  process.exit(1);
}

const subpaths = Object.entries(pkg.exports).filter(([key]) => key !== "./package.json");

for (const [subpath, conditions] of subpaths) {
  console.log(`\n${subpath}`);
  const esmFile = resolve(root, conditions.import.default);
  const cjsFile = resolve(root, conditions.require.default);

  // 1. loads under both module systems, exposing named exports
  let esmExports = [];
  try {
    const loaded = await import(pathToFileURL(esmFile).href);
    esmExports = Object.keys(loaded).filter((key) => key !== "default");
    console.log(`  ✓ ESM loads (${esmExports.length} named exports)`);
  } catch (error) {
    fail(`ESM load failed: ${error.message}`);
  }
  try {
    const loaded = require(cjsFile);
    const cjsExports = Object.keys(loaded).filter((key) => key !== "default");
    console.log(`  ✓ CJS loads (${cjsExports.length} named exports)`);
    const missing = esmExports.filter((name) => !cjsExports.includes(name));
    if (missing.length > 0) fail(`CJS is missing named exports: ${missing.join(", ")}`);
  } catch (error) {
    fail(`CJS load failed: ${error.message}`);
  }

  // the subpath resolves to the surface it promises, not merely to something
  const expected = EXPECTED_EXPORTS[subpath];
  if (expected) {
    const actual = [...esmExports].sort();
    if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
      fail(`${subpath} exports [${actual}], expected [${[...expected].sort()}]`);
    } else {
      console.log(`  ✓ exports exactly ${expected.join(", ")}`);
    }
  }

  // 2. bundled graph contains only what this subpath is allowed to contain
  const forbidden = FORBIDDEN[subpath] ?? [];
  if (forbidden.length > 0) {
    const result = await build({
      entryPoints: [esmFile],
      bundle: true,
      write: false,
      format: "esm",
      platform: "neutral",
      metafile: true,
      logLevel: "silent",
    });
    // The metafile's inputs are the DIST files esbuild read — `dist/latex.js`
    // and whatever shared chunks it imports. Matching source patterns against
    // those can never fire, which is how an earlier version of this check
    // passed while proving nothing.
    //
    // The sourcemaps are what map the shipped bytes back to the modules that
    // produced them, so the forbidden patterns are matched against those. This
    // still inspects the artifact rather than the source graph: a module that
    // was tree-shaken out leaves no sourcemap entry, and one that survived
    // does.
    const inputs = result.metafile.inputs;
    const chunks = Object.keys(inputs).filter((input) => input.endsWith(".js"));
    const analysed = new Set(chunks);
    const sources = new Set();
    for (const chunk of chunks) {
      const mapFile = resolve(root, `${chunk}.map`);
      if (existsSync(mapFile)) {
        const map = JSON.parse(readFileSync(mapFile, "utf8"));
        for (const source of map.sources ?? []) sources.add(source.replace(/^(\.\.\/)+/, ""));
        continue;
      }
      // tsdown emits no map for a pure re-export shim, because it carries no
      // original code — `dist/core.js` is one. That is only safe to skip if
      // everything the shim pulls in is itself analysed here; otherwise an
      // unmapped chunk could hide a forbidden module and this check would go
      // quiet exactly where it matters.
      const unanalysed = (inputs[chunk].imports ?? [])
        .map((entry) => entry.path)
        .filter((path) => !analysed.has(path));
      if (unanalysed.length > 0) {
        fail(
          `${subpath}: ${chunk} has no sourcemap and imports unanalysed ${unanalysed.join(", ")}`,
        );
      }
    }
    if (sources.size === 0) {
      fail(
        `${subpath}: no sources recovered from ${chunks.length} chunk(s); the check would be vacuous`,
      );
    }
    for (const pattern of forbidden) {
      const leaked = [...sources].filter((source) => pattern.test(source));
      if (leaked.length > 0) fail(`${subpath} pulls in ${pattern}: ${leaked.join(", ")}`);
    }
    console.log(`  ✓ artifact clean (${chunks.length} chunk(s), ${sources.size} source modules)`);
  }
}

console.log("\npublint");
if (!run("npx --yes publint")) failures.push("publint");

console.log("\nattw");
// node10 resolution predates the exports map; package.json#engines declares
// node >= 20, so that mode is deliberately out of scope.
if (!run("npx --yes @arethetypeswrong/cli --pack . --ignore-rules no-resolution")) {
  failures.push("attw");
}

if (failures.length > 0) {
  console.error(`\nFAILED: ${failures.length} package-isolation problem(s)`);
  process.exit(1);
}
console.log("\nPackage isolation gate passed.");
