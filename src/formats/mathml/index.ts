/**
 * `@plurimath/plurimath-ts/mathml` — the MathML subpath.
 *
 * Output only for now: MathML *input* is a P4 decision (ARCHITECTURE.md §11),
 * and this entry grows a parser beside `toMathml` if that lands. One physical
 * entry per published subpath (ARCHITECTURE.md §3), so a consumer rendering
 * MathML does not pay for the AsciiMath grammar — proven by the
 * package-isolation gate against the packed artifact.
 *
 * `MathmlOptions` is exported because callers pass it; the XML element tree
 * behind it is not, being plumbing rather than public API (`src/xml/index.ts`).
 */

export type { MathmlOptions } from "./renderer";
export { toMathml } from "./renderer";
