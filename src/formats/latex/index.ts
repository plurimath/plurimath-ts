/**
 * `@plurimath/plurimath-ts/latex` — the LaTeX subpath.
 *
 * Both directions now: the parser landed in P3, and ARCHITECTURE.md §3 is
 * explicit that "a format subpath exports every function that format owns —
 * parsing *and* rendering when both exist". Everything else under
 * `formats/latex/` — the grammar, the transform, the preprocessor, the class
 * registry, `render-shared` — is internal: it is how these functions work, not
 * what a caller uses.
 *
 * One physical entry per published subpath (§3), so a consumer reading or
 * writing LaTeX does not pay for the AsciiMath or MathML slices — proven by the
 * package-isolation gate against the built `dist`, not by import convention.
 *
 * **What adding `parseLatex` costs, measured.** `dist/latex-*.js` grows from
 * 122 KB to 431 KB: the grammar's ordered choice over 3,327 symbol
 * alternatives, the transform's class registry, and `pegkit` itself. That is
 * the shape `./asciimath` already ships (472 KB for its two directions), and
 * the gate's `pegkit/` ban on this subpath — written when "only `/asciimath`
 * has an input side today" was true — is lifted here rather than worked
 * around. A consumer who only renders can still drop the parser: the package
 * is `sideEffects: false` and these are named ESM exports, so a downstream
 * bundler shakes `parseLatex` out of an app that never calls it.
 */

export type { LatexParseOptions } from "./parser";
export { parseLatex } from "./parser";
export type { LatexOptions } from "./renderer";
export { toLatex } from "./renderer";
