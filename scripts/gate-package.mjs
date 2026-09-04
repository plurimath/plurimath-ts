#!/usr/bin/env node
/**
 * Package-isolation gate (ARCHITECTURE.md §3, §7).
 *
 * Source-level import rules and "sideEffects": false do not prove what ships.
 * This gate builds and inspects the real `dist` artifacts:
 *
 *   1. every published subpath loads under ESM and CJS with its named exports
 *   2. each subpath's bundled graph contains only what it is allowed to
 *   3. publint and attw both pass, each against a real packed tarball
 *
 * Executable subpaths are read from package.json#exports. Every one must have
 * non-empty export and graph policies below, so adding a subpath without both
 * rows fails closed. `./package.json` is metadata rather than executable code
 * and is the sole export excluded from those checks. The root default export is
 * asserted only once the compat class exists (§4) — it is deliberately absent
 * at P0.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
 * What each subpath must export, asserted against the BUILT artifact.
 *
 * `test/formats/subpath-surface.spec.ts` pins the same surface from `src/` and
 * checks that the export declaration exists. A miswired export-map target or
 * tsdown entry could still ship the wrong file while that spec stayed green.
 * This is the artifact-side half: it reads each ESM and CJS target from the
 * manifest and imports that file directly. It verifies the declared targets,
 * not Node's package-name or conditional-export resolution.
 */
const CORE_EXPORTS = [
  "AbsNode",
  "BarNode",
  "BaseNode",
  "BinaryFunctionNode",
  "CeilNode",
  "ColorNode",
  "DdotNode",
  "DotNode",
  "FencedNode",
  "FloorNode",
  "FontStyleNode",
  "FormulaNode",
  "FracNode",
  "HatNode",
  "IntNode",
  "LinebreakNode",
  "MissingSymbolDataError",
  "MpaddedNode",
  "MrowNode",
  "NODE_KINDS",
  "NaryNode",
  "NormNode",
  "NumberNode",
  "ObraceNode",
  "OintNode",
  "OverleftrightarrowNode",
  "OversetNode",
  "ParseError",
  "PlurimathError",
  "ProdNode",
  "RenderError",
  "SqrtNode",
  "SumNode",
  "SymbolNode",
  "TableNode",
  "TernaryFunctionNode",
  "TextNode",
  "TildeNode",
  "UbraceNode",
  "UlNode",
  "UnaryFunctionNode",
  "UndersetNode",
  "UnsupportedFormatError",
  "VecNode",
  "assertMathNodeShape",
  "equals",
  "hasNodeKind",
  "normalize",
  "reportUnsupported",
  "resetUnsupportedWarnings",
];

const EXPECTED_EXPORTS = {
  ".": CORE_EXPORTS,
  "./core": CORE_EXPORTS,
  "./asciimath": ["parseAsciimath", "toAsciimath"],
  "./html": ["toHtml"],
  "./latex": ["toLatex"],
  "./mathml": ["toMathml"],
  "./unicodemath": ["toUnicodemath"],
};

/**
 * Entries a subpath must never pull in, keyed by subpath — the slim-bundle
 * guarantee of ARCHITECTURE.md §3, checked against the built `dist` and its
 * sourcemaps rather than against import statements. The publint and attw steps
 * below are the ones that pack the package; this graph check reads `dist`
 * directly.
 *
 * ARCHITECTURE.md:187-193 and :249-255 define a format's ownership across
 * `formats/<F>/`, `render/<kind>/<F>.ts`, and `generated/<F>/`. Deriving those
 * patterns here covers the node-major layout without listing every render kind.
 * `pegkit` is the parser combinator library: only `/asciimath` has an input
 * side today, so only it may carry pegkit. `xml` is the Ox-compatible
 * serializer, needed by MathML alone.
 */
const FORMAT_NAMES = readdirSync(resolve(root, "src/formats"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const formatOwnedSources = (format) => {
  const escaped = escapeRegExp(format);
  return [
    new RegExp(`(?:^|/)formats/${escaped}/`),
    new RegExp(`(?:^|/)render/[^/]+/${escaped}\\.ts$`),
    new RegExp(`(?:^|/)generated/${escaped}/`),
  ];
};
const forbidOtherFormats = (allowedFormat) =>
  FORMAT_NAMES.filter((format) => format !== allowedFormat).flatMap(formatOwnedSources);
const NO_FORBIDDEN_SOURCES = Symbol("NO_FORBIDDEN_SOURCES");

const FORBIDDEN = {
  // The root is intentionally full-sized; only subpath imports are slim.
  ".": NO_FORBIDDEN_SOURCES,
  "./core": [...forbidOtherFormats(), /pegkit\//],
  "./asciimath": [...forbidOtherFormats("asciimath"), /xml\//],
  // HTML is output-only: no grammar, and its markup is built as strings
  // rather than through the XML layer.
  "./html": [...forbidOtherFormats("html"), /pegkit\//, /xml\//],
  "./latex": [...forbidOtherFormats("latex"), /pegkit\//, /xml\//],
  "./mathml": [...forbidOtherFormats("mathml"), /pegkit\//],
  // UnicodeMath is text output like latex, so it needs no XML layer and no
  // grammar — its graph is core plus its own generated slice, nothing else.
  "./unicodemath": [...forbidOtherFormats("unicodemath"), /pegkit\//, /xml\//],
};

const failures = [];
const fail = (message) => {
  console.log(`  ✗ ${message}`);
  failures.push(message);
};

const subpaths = Object.entries(pkg.exports).filter(([key]) => key !== "./package.json");
for (const [subpath] of subpaths) {
  const expected = EXPECTED_EXPORTS[subpath];
  if (!Array.isArray(expected) || expected.length === 0) {
    fail(`${subpath} must have a non-empty EXPECTED_EXPORTS row`);
  }

  const forbidden = FORBIDDEN[subpath];
  if (forbidden !== NO_FORBIDDEN_SOURCES && (!Array.isArray(forbidden) || forbidden.length === 0)) {
    fail(`${subpath} must have a non-empty FORBIDDEN row`);
  }
}
if (failures.length > 0) {
  console.error(`\nFAILED: ${failures.length} package-policy problem(s)`);
  process.exit(1);
}

console.log("building…");
if (!run("pnpm build")) {
  console.error("build failed");
  process.exit(1);
}

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
  let cjsExports = [];
  try {
    const loaded = require(cjsFile);
    cjsExports = Object.keys(loaded).filter((key) => key !== "default");
    console.log(`  ✓ CJS loads (${cjsExports.length} named exports)`);
  } catch (error) {
    fail(`CJS load failed: ${error.message}`);
  }

  // the subpath resolves to the surface it promises, not merely to something
  const expected = EXPECTED_EXPORTS[subpath];
  for (const [moduleSystem, exports] of [
    ["ESM", esmExports],
    ["CJS", cjsExports],
  ]) {
    const actual = [...exports].sort();
    if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) {
      fail(`${subpath} ${moduleSystem} exports [${actual}], expected [${[...expected].sort()}]`);
    } else {
      console.log(`  ✓ ${moduleSystem} exports exactly ${expected.join(", ")}`);
    }
  }

  // 2. bundled graph contains only what this subpath is allowed to contain
  const forbidden = FORBIDDEN[subpath];
  if (forbidden !== NO_FORBIDDEN_SOURCES) {
    for (const [moduleSystem, entryFile, format, extension] of [
      ["ESM", esmFile, "esm", ".js"],
      ["CJS", cjsFile, "cjs", ".cjs"],
    ]) {
      const failuresBeforeGraph = failures.length;
      const result = await build({
        entryPoints: [entryFile],
        bundle: true,
        write: false,
        format,
        platform: "neutral",
        metafile: true,
        logLevel: "silent",
      });
      // The metafile's inputs are the DIST files esbuild read — `dist/latex.js`
      // or `dist/latex.cjs` and whatever shared chunks it imports. Matching
      // source patterns against those can never fire, which is how an earlier
      // version of this check passed while proving nothing.
      //
      // The sourcemaps are what map the shipped bytes back to the modules that
      // produced them, so the forbidden patterns are matched against those.
      // This still inspects the artifact rather than the source graph: a module
      // that was tree-shaken out leaves no sourcemap entry, and one that
      // survived does.
      const inputs = result.metafile.inputs;
      const chunks = Object.keys(inputs).filter((input) => input.endsWith(extension));
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
        // original code — `dist/core.js` and `dist/core.cjs` are examples. That
        // is only safe to skip if everything the shim pulls in is itself
        // analysed here; otherwise an unmapped chunk could hide a forbidden
        // module and this check would go quiet exactly where it matters.
        const unanalysed = (inputs[chunk].imports ?? [])
          .map((entry) => entry.path)
          .filter((path) => !analysed.has(path));
        if (unanalysed.length > 0) {
          fail(
            `${subpath} ${moduleSystem}: ${chunk} has no sourcemap and imports unanalysed ${unanalysed.join(", ")}`,
          );
        }
      }
      if (sources.size === 0) {
        fail(
          `${subpath} ${moduleSystem}: no sources recovered from ${chunks.length} chunk(s); the check would be vacuous`,
        );
      }
      for (const pattern of forbidden) {
        const leaked = [...sources].filter((source) => pattern.test(source));
        if (leaked.length > 0) {
          fail(`${subpath} ${moduleSystem} pulls in ${pattern}: ${leaked.join(", ")}`);
        }
      }
      if (failures.length === failuresBeforeGraph) {
        console.log(
          `  ✓ ${moduleSystem} artifact clean (${chunks.length} chunk(s), ${sources.size} source modules)`,
        );
      }
    }
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
