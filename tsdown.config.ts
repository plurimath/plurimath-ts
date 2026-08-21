import { defineConfig } from "tsdown";

/**
 * One physical entry per published subpath (ARCHITECTURE.md §3): source-level
 * import rules alone cannot prove what ships, so each subpath is built
 * separately and the package-isolation gate inspects the packed artifacts.
 *
 * `platform: "neutral"` overrides tsdown's Node default — D2 targets browser
 * bundlers as well as Node.
 */
export default defineConfig({
  entry: {
    index: "src/index.ts",
    core: "src/core/index.ts",
    asciimath: "src/formats/asciimath/index.ts",
    latex: "src/formats/latex/index.ts",
    mathml: "src/formats/mathml/index.ts",
    unicodemath: "src/formats/unicodemath/index.ts",
  },
  format: ["esm", "cjs"],
  platform: "neutral",
  target: "es2022",
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
});
