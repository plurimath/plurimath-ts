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
      html: "src/formats/html/index.ts",
      latex: "src/formats/latex/index.ts",
      mathml: "src/formats/mathml/index.ts",
      omml: "src/formats/omml/index.ts",
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
