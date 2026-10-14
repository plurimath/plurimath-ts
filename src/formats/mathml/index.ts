/**
 * `@plurimath/plurimath-ts/mathml` — the MathML subpath.
 *
 * Parses MathML documents and renders formula trees. One physical entry per
 * published subpath (ARCHITECTURE.md §3), so a consumer reading or rendering
 * MathML does not pay for the AsciiMath grammar — checked by the
 * package-isolation gate against the built `dist`.
 *
 * `MathmlOptions` is exported because callers pass it; the XML element tree
 * behind it is not, being plumbing rather than public API (`src/xml/index.ts`).
 */

export type { UnitsmlRenderOptions } from "../../unitsml/index";
export { parseMathml } from "./parser";
export type { MathmlOptions } from "./renderer";
export { toMathml } from "./renderer";
