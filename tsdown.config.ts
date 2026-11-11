import { defineConfig } from "tsdown";

/**
 * One physical entry per published subpath (ARCHITECTURE.md §3): source-level
 * import rules alone cannot prove what ships, so each subpath is built
 * separately and the package-isolation gate inspects the built `dist`.
 *
 * `platform: "neutral"` overrides tsdown's Node default — D2 targets browser
 * bundlers as well as Node.
 */
export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      core: "src/core/index.ts",
      asciimath: "src/formats/asciimath/index.ts",
      "asciimath-amath": "src/formats/asciimath/amath.ts",
      "unicodemath-umath": "src/formats/unicodemath/umath.ts",
      "latex-latexmath": "src/formats/latex/latexmath.ts",
      html: "src/formats/html/index.ts",
      latex: "src/formats/latex/index.ts",
      mathml: "src/formats/mathml/index.ts",
      omml: "src/formats/omml/index.ts",
      "mathml-leptris": "src/formats/mathml/leptris.ts",
      "omml-leptris": "src/formats/omml/leptris.ts",
      unicodemath: "src/formats/unicodemath/index.ts",
    },
    format: ["esm", "cjs"],
    platform: "neutral",
    target: "es2022",
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
  },
  /**
   * `./evaluation/wasm`, built on its own so its bundled verbatim wasm-bindgen
   * glue can be compiled without host shims: the glue's default-asset branch
   * (`new URL("plurimath_numeric_bg.wasm", import.meta.url)`) is unreachable
   * because the facade always hands it a verified, compiled module, and in
   * CJS rolldown would otherwise rewrite it to `require("url")`. `clean: false`
   * keeps the outputs the config above just wrote.
   */
  {
    entry: { "evaluation-wasm": "src/evaluation/wasm.ts" },
    format: ["esm", "cjs"],
    platform: "neutral",
    target: "es2022",
    dts: true,
    sourcemap: true,
    clean: false,
    treeshake: true,
    define: { "import.meta.url": "undefined" },
    // The evaluator kernel binary, its licence, the exact notices of
    // every crate compiled into it and its Cargo.lock source pin ship beside
    // the `./evaluation/wasm` entry (which bundles the verbatim wasm-bindgen
    // glue); package.json exports the binary as
    // `./evaluation/plurimath_numeric.wasm`. assets/wasm/manifest.json pins it.
    copy: [
      { from: "assets/wasm/plurimath_numeric.wasm", to: "dist" },
      { from: "assets/wasm/LICENSE", to: "dist", rename: "plurimath_numeric.LICENSE" },
      { from: "assets/wasm/NOTICE", to: "dist", rename: "plurimath_numeric.NOTICE" },
      { from: "assets/wasm/Cargo.lock", to: "dist", rename: "plurimath_numeric.Cargo.lock" },
      { from: "assets/wasm/licenses", to: "dist", rename: "plurimath_numeric.licenses" },
    ],
  },
  /**
   * The `plurimath` bin (package.json `bin`), built separately: it is a Node
   * executable, not a bundler-consumed subpath, so it gets `platform: "node"`
   * (it uses `node:fs` and `process.stdin`) and a single ESM output — a bin
   * script does not need a CJS twin or declaration file. `clean: false` so
   * this entry does not wipe the library outputs the other config just wrote
   * (tsdown builds each config in the array independently).
   */
  {
    entry: { cli: "src/cli/index.ts" },
    format: ["esm"],
    platform: "node",
    target: "es2022",
    dts: false,
    sourcemap: true,
    clean: false,
    treeshake: true,
  },
]);
