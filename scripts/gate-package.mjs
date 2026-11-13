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
 *   4. the root's default-exported compat class declares exactly the surface
 *      checked in at test/fixtures/compat/plurimath-declaration.json, in both
 *      the ESM and the CJS declaration file
 *
 * Executable subpaths are read from package.json#exports. Every one must have
 * non-empty export and graph policies below, so adding a subpath without both
 * rows fails closed. `./package.json` is metadata rather than executable code
 * and is the sole export excluded from those checks. The root default export is
 * asserted only once the compat class exists (§4) — it is deliberately absent
 * at P0.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { checkDeclarationFiles } from "./lib/compat-declaration.mjs";

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
  "InvalidTypeError",
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
  "ParseOptionError",
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
  "UnitsmlNode",
  "UbraceNode",
  "UlNode",
  "UnaryFunctionNode",
  "UncertaintyNode",
  "UndersetNode",
  "UnsupportedFeatureError",
  "UnsupportedFormatError",
  "VecNode",
  "assertMathNodeShape",
  "equals",
  "hasNodeKind",
  "normalize",
  "reportUnsupported",
  "resetUnsupportedWarnings",
];

/**
 * `evaluate(formula, bindings)`, `evaluateResult` with its value formatter, and
 * the `Errors::Evaluation::*` family (`src/evaluation/index.ts`) — root-only, like the compat class below: §3
 * rule 6 lets `evaluation` import `core` but nothing reaches it from a format
 * subpath, so it has no home there, only at the root `export * from
 * "./evaluation/index"` (`src/index.ts`).
 */
const EVALUATION_EXPORTS = [
  "DivisionByZeroError",
  "EvaluationError",
  "InvalidBindingError",
  "InvalidBindingKeyError",
  "MathDomainError",
  "MissingVariableError",
  "NonFiniteResultError",
  "UnsupportedExpressionError",
  "evaluate",
  "evaluateQuantity",
  "evaluateRequest",
  "evaluateResult",
  "inspectEvaluationValue",
];

/**
 * The root additionally carries the `plurimath-js` compat class (ARCHITECTURE.md
 * §4). It is only at the root: it delegates to every renderer, so putting it
 * behind a format subpath would drag all of them into that subpath's graph and
 * break the slim-bundle guarantee the subpaths exist for.
 */
const ROOT_EXPORTS = [
  ...CORE_EXPORTS,
  ...EVALUATION_EXPORTS,
  "FORMATS",
  "Plurimath",
  "parse",
].sort();

/**
 * Subpaths whose BUILT artifact must expose a default export, and what it must
 * be. ARCHITECTURE.md §3 held this open — "the root's default export is
 * asserted only once the compat class exists, §4" — and the compat class now
 * exists, so it is asserted here.
 *
 * It is checked against `dist`, not against source, because `import Plurimath
 * from "@plurimath/plurimath"` is the single entry point every plurimath-js
 * consumer uses, and a miswired export-map target or tsdown entry would ship
 * the wrong file while a source-importing spec stayed green.
 */
const EXPECTED_DEFAULT = {
  ".": "Plurimath",
};

const EXPECTED_EXPORTS = {
  ".": ROOT_EXPORTS,
  "./core": CORE_EXPORTS,
  "./evaluation/wasm": [
    "NUMERIC_WASM_ASSET",
    "NumericWasmError",
    "evaluateQuantityRequest",
    "initNumericWasm",
    "numericWasmFromExports",
  ],
  "./facade/wasm": [
    "FACADE_WASM_ASSET",
    "FacadeError",
    "FacadeWasmError",
    "Formula",
    "RUBY_VALUES_PROFILE",
    "SourceFormula",
    "facadeWasmFromExports",
    "initFacadeWasm",
  ],
  "./asciimath": ["parseAsciimath", "toAsciimath"],
  "./asciimath/amath": ["createAsciimathParser"],
  "./latex/latexmath": ["createLatexParser"],
  "./unicodemath/umath": ["createUnicodemathParser"],
  "./html": ["parseHtml", "toHtml"],
  "./html/parsanol": ["createHtmlParser"],
  "./latex": ["parseLatex", "toLatex"],
  "./mathml": ["parseMathml", "toMathml"],
  "./omml": ["parseOmml", "toOmml"],
  "./mathml/leptris": ["createMathmlParser"],
  "./omml/leptris": ["createOmmlParser"],
  "./unicodemath": ["parseUnicodemath", "toUnicodemath"],
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
 * `pegkit` is the parser combinator library, so a subpath may carry it exactly
 * when that format has an input side: `/asciimath`, `/latex` since its
 * transform landed, `/unicodemath` since `parseUnicodemath` did, and `/html`
 * since the HTML transform did. `xml` is the Ox-compatible serializer,
 * needed by MathML alone.
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

/**
 * Locale data (TODO.plan/p4-parity-modules, "Isolation assertions proving
 * locale data stays out of unrelated subpaths"). The gem's locale table is
 * emitted as two generated modules, one per column:
 *
 * - `locale-decimals.ts`, the decimal marker. Each parser reads it at parse
 *   time (`src/formatting/locales.ts`), so the four subpaths with a parser
 *   carry it; `/core` has no parser, and the XML parsers on `/mathml` and
 *   `/omml` do not read locale options, so those subpaths must not carry it.
 * - `locale-groups.ts`, the grouping separator. Nothing in `src/` imports it
 *   yet, so no subpath may carry it; the formatter that first needs it must
 *   change this row on purpose rather than ship it everywhere unnoticed.
 *
 * `REQUIRED` below is the positive control: the parser subpaths must still
 * contain the decimal table, so a pattern that stops matching the real
 * source path fails here instead of passing vacuously.
 */
const LOCALE_DECIMALS = /(?:^|\/)formatting\/generated\/locale-decimals\.ts$/;
const LOCALE_GROUPS = /(?:^|\/)formatting\/generated\/locale-groups\.ts$/;
// Optional readers must contain only their own format, its generated tables,
// core and XML. This also excludes runtime dependencies, renderers and WASM.
const optionalReaderOutside = (format) =>
  new RegExp(`^(?!(?:src/)?(?:core|xml)/|(?:src/)?(?:formats|generated)/${format}/)`);

// The WASM facade is transport only: no format, parser, XML, locale table or
// TypeScript evaluator module may ship in it (no independent evaluator).
// The only other modules are the kernel's verbatim wasm-bindgen glue and the
// typed quantity request/response transport (types plus a JSON pass-through).
const WASM_GLUE = /(?:^|\/)evaluation\/quantity-wasm\/numeric\.js$/;
const WASM_FACADE_ONLY =
  /^(?!(?:src\/)?evaluation\/(?:wasm\.ts|quantity-wire\.ts|quantity-wasm\/numeric\.js)$)/;

// The format facade is transport only as well: its loader, the generated pin
// and the official wasm-bindgen glue, and no TypeScript parser, renderer or
// evaluator (no duplicate implementation beside the native facade).
const FACADE_GLUE = /(?:^|\/)facade\/facade-wasm\/facade\.js$/;
const FACADE_ONLY = /^(?!(?:src\/)?facade\/(?:wasm\.ts|asset\.ts|facade-wasm\/facade\.js)$)/;

const FORBIDDEN = {
  // The root is intentionally full-sized; only subpath imports are slim.
  ".": NO_FORBIDDEN_SOURCES,
  "./evaluation/wasm": [WASM_FACADE_ONLY],
  "./facade/wasm": [FACADE_ONLY],
  "./core": [...forbidOtherFormats(), /pegkit\//, LOCALE_DECIMALS, LOCALE_GROUPS],
  "./asciimath": [...forbidOtherFormats("asciimath"), /xml\//, LOCALE_GROUPS],
  "./latex/latexmath": [
    ...forbidOtherFormats("latex"),
    /xml\//,
    LOCALE_GROUPS,
    /formats\/latex\/grammar\.ts$/,
  ],
  "./unicodemath/umath": [
    ...forbidOtherFormats("unicodemath"),
    /xml\//,
    LOCALE_GROUPS,
    /formats\/unicodemath\/grammar\.ts$/,
  ],
  "./asciimath/amath": [
    ...forbidOtherFormats("asciimath"),
    /xml\//,
    LOCALE_GROUPS,
    /formats\/asciimath\/grammar\.ts$/,
  ],
  // HTML parses as well as renders, so pegkit is expected here; `xml` still
  // is not, because the HTML renderer builds its markup as strings rather
  // than through the XML layer.
  "./html": [...forbidOtherFormats("html"), /xml\//, LOCALE_GROUPS],
  "./html/parsanol": [
    ...forbidOtherFormats("html"),
    /xml\//,
    LOCALE_GROUPS,
    /formats\/html\/grammar\.ts$/,
  ],
  // LaTeX parses as well as renders (ARCHITECTURE.md §3, "parsing *and*
  // rendering when both exist"), so pegkit is expected here; `xml` still is
  // not, because LaTeX output is text.
  "./latex": [...forbidOtherFormats("latex"), /xml\//, LOCALE_GROUPS],
  "./mathml": [...forbidOtherFormats("mathml"), /pegkit\//, LOCALE_DECIMALS, LOCALE_GROUPS],
  // OMML reads and writes through the XML layer. Its parser needs neither
  // pegkit nor locale tables, so those remain forbidden in this subpath.
  "./omml": [...forbidOtherFormats("omml"), /pegkit\//, LOCALE_DECIMALS, LOCALE_GROUPS],
  "./mathml/leptris": [optionalReaderOutside("mathml"), /(?:^|\/)render(?:er|-shared)?\.ts$/],
  "./omml/leptris": [optionalReaderOutside("omml"), /(?:^|\/)render(?:er|-shared)?\.ts$/],
  // UnicodeMath parses as well as renders, so pegkit is expected here on the
  // same grounds as `/latex`; `xml` still is not, because its output is text.
  "./unicodemath": [...forbidOtherFormats("unicodemath"), /xml\//, LOCALE_GROUPS],
};

/** Sources a subpath's artifact must contain — the positive control for `FORBIDDEN`'s locale rows. */
const REQUIRED = {
  "./evaluation/wasm": [/(?:^|\/)evaluation\/wasm\.ts$/, WASM_GLUE],
  "./facade/wasm": [/(?:^|\/)facade\/wasm\.ts$/, FACADE_GLUE],
  "./mathml/leptris": [/(?:^|\/)xml\/leptris\.ts$/, /(?:^|\/)formats\/mathml\/translator\.ts$/],
  "./omml/leptris": [/(?:^|\/)xml\/leptris\.ts$/, /(?:^|\/)formats\/omml\/translator\.ts$/],
  "./asciimath": [LOCALE_DECIMALS],
  "./asciimath/amath": [LOCALE_DECIMALS, /formats\/asciimath\/amath\.ts$/],
  "./latex/latexmath": [LOCALE_DECIMALS, /formats\/latex\/latexmath\.ts$/],
  "./unicodemath/umath": [LOCALE_DECIMALS, /formats\/unicodemath\/umath\.ts$/],
  "./html": [LOCALE_DECIMALS],
  "./html/parsanol": [LOCALE_DECIMALS, /formats\/html\/parsanol\.ts$/],
  "./latex": [LOCALE_DECIMALS],
  "./unicodemath": [LOCALE_DECIMALS],
};

const failures = [];
const fail = (message) => {
  console.log(`  ✗ ${message}`);
  failures.push(message);
};

/**
 * Non-code exports: published files a consumer resolves by specifier. Each must
 * exist in `dist` after the build with the digest its pin manifest records.
 */
const ASSET_EXPORTS = {
  "./evaluation/plurimath_numeric.wasm": "assets/wasm/manifest.json",
};
const HTML_ASSET_EXPORTS = JSON.parse(
  readFileSync(resolve(root, "assets/html/manifest.json"), "utf8"),
).artifacts;
/**
 * The facade binary is exported only once `assets/facade/manifest.json` is
 * pinned (`scripts/pin-facade-wasm.mjs`); while it is pending the export must
 * be absent, so a package can never name a binary it does not ship.
 */
const FACADE_ASSET_EXPORT = "./facade/plurimath_facade.wasm";
const facadePin = JSON.parse(readFileSync(resolve(root, "assets/facade/manifest.json"), "utf8"));
if (facadePin.status !== "pinned" && Object.hasOwn(pkg.exports, FACADE_ASSET_EXPORT))
  fail(
    `${FACADE_ASSET_EXPORT} is exported while assets/facade/manifest.json is ${facadePin.status}`,
  );
if (
  facadePin.status === "pinned" &&
  pkg.exports[FACADE_ASSET_EXPORT] !== `./dist/${facadePin.file}`
)
  fail(`${FACADE_ASSET_EXPORT} must map to ./dist/${facadePin.file}`);
const NON_CODE_EXPORTS = {
  ...ASSET_EXPORTS,
  ...HTML_ASSET_EXPORTS,
  ...(facadePin.status === "pinned"
    ? { [FACADE_ASSET_EXPORT]: "assets/facade/manifest.json" }
    : {}),
};
const subpaths = Object.entries(pkg.exports).filter(
  ([key]) => key !== "./package.json" && !Object.hasOwn(NON_CODE_EXPORTS, key),
);
for (const [key, target] of Object.entries(pkg.exports)) {
  if (
    typeof target === "string" &&
    key !== "./package.json" &&
    !Object.hasOwn(NON_CODE_EXPORTS, key)
  )
    fail(`${key} is a string export without an ASSET_EXPORTS row`);
}
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
// No subpath ships `locale-groups.ts`, so `REQUIRED` cannot catch a pattern
// that has drifted from its path; tie each locale pattern to the real file.
const generatedDir = resolve(root, "src/formatting/generated");
let generatedFiles = [];
try {
  generatedFiles = readdirSync(generatedDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `src/formatting/generated/${entry.name}`);
} catch (error) {
  fail(`cannot read src/formatting/generated: ${error.message}`);
}
for (const pattern of [LOCALE_DECIMALS, LOCALE_GROUPS]) {
  if (generatedFiles.filter((file) => pattern.test(file)).length !== 1) {
    fail(`${pattern} must match exactly one file in src/formatting/generated`);
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
  let esmDefault;
  let cjsDefault;
  let esmExports = [];
  try {
    const loaded = await import(pathToFileURL(esmFile).href);
    esmDefault = loaded.default;
    esmExports = Object.keys(loaded).filter((key) => key !== "default");
    console.log(`  ✓ ESM loads (${esmExports.length} named exports)`);
  } catch (error) {
    fail(`ESM load failed: ${error.message}`);
  }
  let cjsExports = [];
  try {
    const loaded = require(cjsFile);
    cjsDefault = loaded.default;
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

  // 1b. the default export, where the subpath promises one
  const expectedDefault = EXPECTED_DEFAULT[subpath];
  for (const [moduleSystem, value] of [
    ["ESM", esmDefault],
    ["CJS", cjsDefault],
  ]) {
    if (expectedDefault === undefined) {
      if (value !== undefined) {
        fail(`${subpath} ${moduleSystem} has an unexpected default export`);
      }
      continue;
    }
    if (typeof value !== "function" || value.name !== expectedDefault) {
      const got = value === undefined ? "none" : `${typeof value} ${value?.name ?? ""}`.trim();
      fail(
        `${subpath} ${moduleSystem} default export is ${got}, expected class ${expectedDefault}`,
      );
    } else {
      console.log(`  ✓ ${moduleSystem} default export is ${expectedDefault}`);
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
      if (subpath.endsWith("/leptris")) {
        const external = Object.values(result.metafile.outputs)
          .flatMap((output) => output.imports)
          .filter((entry) => entry.external);
        if (external.length > 0) {
          fail(
            `${subpath} ${moduleSystem} imports external runtime modules: ${external.map((entry) => entry.path).join(", ")}`,
          );
        }
      }
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
      for (const pattern of REQUIRED[subpath] ?? []) {
        if (![...sources].some((source) => pattern.test(source))) {
          fail(`${subpath} ${moduleSystem} no longer contains required source ${pattern}`);
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

// HTML artifacts are exact source exports; never reserialize them before runtime loading.
for (const [key, pin] of Object.entries(HTML_ASSET_EXPORTS)) {
  const target = pkg.exports[key];
  if (target !== `./dist/html-artifacts/${pin.file}`) {
    fail(`${key}: unexpected artifact export target`);
    continue;
  }
  const bytes = readFileSync(resolve(root, target));
  if (
    createHash("sha256").update(bytes).digest("hex") !== pin.sha256 ||
    bytes.length !== pin.bytes
  ) {
    fail(`${key}: source artifact bytes changed`);
  }
}

// 3. every asset export ships the exact pinned bytes
console.log("\nasset exports");
for (const [key, manifestPath] of Object.entries(ASSET_EXPORTS)) {
  const target = pkg.exports[key];
  const pin = JSON.parse(readFileSync(resolve(root, manifestPath), "utf8"));
  if (
    typeof target !== "string" ||
    !target.startsWith("./dist/") ||
    !target.endsWith(`/${pin.file}`)
  ) {
    fail(`${key} must map to ./dist/${pin.file}`);
    continue;
  }
  const file = resolve(root, target);
  if (!existsSync(file)) {
    fail(`${key}: ${target} was not built`);
    continue;
  }
  const bytes = readFileSync(file);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== pin.sha256 || bytes.length !== pin.bytes) {
    fail(`${key}: ${target} is ${digest}/${bytes.length}, pinned ${pin.sha256}/${pin.bytes}`);
  } else {
    console.log(`  ✓ ${key} → ${target} sha256 ${digest}`);
  }
  const source = readFileSync(resolve(root, "src/evaluation/wasm.ts"), "utf8");
  if (!source.includes(`sha256: "${pin.sha256}"`) || !source.includes(`bytes: ${pin.bytes},`)) {
    fail(`src/evaluation/wasm.ts NUMERIC_WASM_ASSET does not pin ${manifestPath}`);
  }
  // Pinned companions: verbatim glue (bundled into the entry), licence,
  // notice, Cargo.lock and every dependency notice, byte-exact in dist.
  const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
  const assetDir = dirname(resolve(root, manifestPath));
  const pinned = [];
  if (pin.glue) {
    pinned.push([resolve(root, pin.glue.file), pin.glue.sha256]);
    pinned.push([resolve(root, pin.glue.types_file), pin.glue.types_sha256]);
    if (!source.includes(`sha256: "${pin.glue.sha256}"`))
      fail(`src/evaluation/wasm.ts NUMERIC_WASM_ASSET does not pin the glue digest`);
  }
  pinned.push([resolve(root, "dist/plurimath_numeric.LICENSE"), pin.license.sha256]);
  pinned.push([resolve(root, "dist/plurimath_numeric.NOTICE"), pin.notice.sha256]);
  if (pin.source?.cargo_lock)
    pinned.push([resolve(root, "dist/plurimath_numeric.Cargo.lock"), pin.source.cargo_lock.sha256]);
  if (pin.dependency_notices) {
    const listing = resolve(assetDir, pin.dependency_notices.manifest);
    pinned.push([listing, pin.dependency_notices.sha256]);
    const groups = JSON.parse(readFileSync(listing, "utf8"));
    if (groups.length !== pin.dependency_notices.groups)
      fail(`${pin.dependency_notices.manifest} lists ${groups.length} groups`);
    for (const group of groups)
      for (const notice of group.notices)
        pinned.push([
          resolve(root, "dist/plurimath_numeric.licenses", notice.file.slice(9)),
          notice.sha256,
        ]);
  }
  const drift = pinned.filter(([path, digest]) => !existsSync(path) || sha(path) !== digest);
  for (const [path] of drift) fail(`${path} is missing or differs from ${manifestPath}`);
  if (drift.length === 0) console.log(`  ✓ ${pinned.length} pinned companion files byte-exact`);
}

// 3b. the facade pin: binary (once pinned), glue, licences, notices, every
// dependency notice and Cargo.lock, byte-exact against assets/facade/manifest.json.
console.log("\nfacade asset");
{
  const pin = facadePin;
  const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
  const source = readFileSync(resolve(root, "src/facade/asset.ts"), "utf8");
  if (!source.includes(`status: "${pin.status}"`))
    fail(`src/facade/asset.ts does not carry the manifest status ${pin.status}`);
  if (
    !source.includes(`revision: "${pin.source.revision}"`) ||
    !source.includes(`sha256: "${pin.glue.sha256}"`)
  )
    fail("src/facade/asset.ts does not pin the manifest source revision and glue digest");
  const pinned = [
    [resolve(root, pin.glue.file), pin.glue.sha256],
    [resolve(root, pin.glue.types_file), pin.glue.types_sha256],
    [resolve(root, "dist/plurimath_facade.Cargo.lock"), pin.source.cargo_lock.sha256],
  ];
  for (const notice of pin.notices)
    pinned.push([
      resolve(root, "dist/plurimath_facade.notices", notice.file.slice(8)),
      notice.sha256,
    ]);
  const listing = resolve(root, "assets/facade", pin.dependency_notices.manifest);
  pinned.push([listing, pin.dependency_notices.sha256]);
  const groups = JSON.parse(readFileSync(listing, "utf8"));
  if (groups.length !== pin.dependency_notices.groups)
    fail(`${pin.dependency_notices.manifest} lists ${groups.length} groups`);
  for (const group of groups) {
    if (
      group.notices.length === 0 &&
      !Object.hasOwn(pin.dependency_notices.without_notice_files, group.package)
    )
      fail(`${group.package} has no notice file and no recorded reason`);
    for (const notice of group.notices)
      pinned.push([
        resolve(root, "dist/plurimath_facade.licenses", notice.file.slice(9)),
        notice.sha256,
      ]);
  }
  if (pin.status === "pinned") {
    if (!source.includes(`sha256: "${pin.sha256}"`) || !source.includes(`bytes: ${pin.bytes} `))
      fail("src/facade/asset.ts FACADE_WASM_ASSET does not pin the manifest binary");
    const file = resolve(root, "dist", pin.file);
    if (!existsSync(file) || readFileSync(file).length !== pin.bytes)
      fail(`dist/${pin.file} is missing or has the wrong size`);
    pinned.push([file, pin.sha256]);
  } else {
    if (pin.sha256 !== null || existsSync(resolve(root, "dist", pin.file)))
      fail("a pending facade pin must name no binary and ship none");
    console.log("  · facade binary pending: run scripts/pin-facade-wasm.mjs with the final packet");
  }
  const drift = pinned.filter(([path, digest]) => !existsSync(path) || sha(path) !== digest);
  for (const [path] of drift)
    fail(`${path} is missing or differs from assets/facade/manifest.json`);
  if (drift.length === 0) console.log(`  ✓ ${pinned.length} pinned facade files byte-exact`);
}

// 4. the compat class's declaration surface, from the BUILT declaration files
// the root's `types` conditions name (TODO.plan/p2-output-formats/
// 03-compat-class.md). test/gates/compat-declaration.spec.ts proves this check
// fails on each drift class; this is where it runs against the real artifact.
console.log("\ncompat class declarations");
{
  const fixture = JSON.parse(
    readFileSync(resolve(root, "test/fixtures/compat/plurimath-declaration.json"), "utf8"),
  );
  const declarations = {};
  for (const condition of ["import", "require"]) {
    const target = pkg.exports["."]?.[condition]?.types;
    const label = target ?? `(no "." ${condition} types condition)`;
    const file = target === undefined ? undefined : resolve(root, target);
    declarations[label] =
      file !== undefined && existsSync(file) ? readFileSync(file, "utf8") : undefined;
  }
  const declarationFailures = checkDeclarationFiles(declarations, fixture.surface);
  for (const message of declarationFailures) fail(message);
  if (declarationFailures.length === 0) {
    console.log(
      `  ✓ ${Object.keys(declarations).join(" and ")} declare exactly the fixture's ${fixture.surface.members.length} members`,
    );
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
