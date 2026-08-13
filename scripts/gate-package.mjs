#!/usr/bin/env node
/**
 * Package-isolation gate (ARCHITECTURE.md §3, §7).
 *
 * Source-level import rules and "sideEffects": false do not prove what ships.
 * This gate builds, packs, and then inspects the real artifacts:
 *
 *   1. every published subpath loads under ESM and CJS with its named exports
 *   2. each subpath's bundled graph contains only what it is allowed to
 *   3. publint and attw pass on the packed tarball
 *
 * The subpath list is read from package.json#exports, so new formats need no
 * change here. The root default export is asserted only once the compat class
 * exists (§4) — it is deliberately absent at P0.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
 * guarantee of ARCHITECTURE.md §3, checked against the packed artifact rather
 * than against import statements.
 *
 * A consumer who reads AsciiMath should not pay for the LaTeX or MathML
 * renderers, and one who renders LaTeX should not pay for a parser at all.
 * `pegkit` is the parser combinator library: only `/asciimath` has an input
 * side today, so only it may carry pegkit. `xml` is the Ox-compatible
 * serializer, needed by MathML alone.
 */
const FORBIDDEN = {
  "./core": [/formats\//, /pegkit\//],
  "./asciimath": [/formats\/latex\//, /formats\/mathml\//, /xml\//],
  "./latex": [/formats\/asciimath\//, /formats\/mathml\//, /pegkit\//, /xml\//],
  "./mathml": [/formats\/asciimath\//, /formats\/latex\//, /pegkit\//],
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
    const inputs = Object.keys(result.metafile.inputs);
    for (const pattern of forbidden) {
      const leaked = inputs.filter((input) => pattern.test(input));
      if (leaked.length > 0) fail(`${subpath} pulls in ${pattern}: ${leaked.join(", ")}`);
    }
    console.log(`  ✓ bundle graph clean (${inputs.length} modules)`);
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
