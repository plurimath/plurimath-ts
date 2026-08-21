/**
 * `@plurimath/plurimath-ts/latex` — the LaTeX subpath.
 *
 * Output only for now: the LaTeX *parser* arrives in P3, and this entry grows
 * a `parseLatex` beside `toLatex` when it does. One physical entry per
 * published subpath (ARCHITECTURE.md §3), so a consumer rendering LaTeX does
 * not pay for the AsciiMath grammar — proven by the package-isolation gate
 * against the built `dist`, not by import convention.
 */

export type { LatexOptions } from "./renderer";
export { toLatex } from "./renderer";
