/**
 * `@plurimath/plurimath-ts/omml` — the OMML subpath.
 *
 * Output only: OMML has no parser in this codebase (ARCHITECTURE.md §11
 * tracks MathML's input side as a P4 decision; OMML's has never been
 * started). This entry grows a parser beside `toOmml` if that ever lands.
 * One physical entry per published subpath (ARCHITECTURE.md §3), so a
 * consumer rendering OMML does not pay for the AsciiMath grammar — proven by
 * the package-isolation gate against the built `dist`.
 *
 * `OmmlOptions` is exported because callers pass it; the XML element tree
 * behind it is not, being plumbing rather than public API (`src/xml/index.ts`).
 */

export type { OmmlOptions } from "./renderer";
export { toOmml } from "./renderer";
