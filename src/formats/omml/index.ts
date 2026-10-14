/**
 * `@plurimath/plurimath-ts/omml` — the OMML subpath.
 *
 * Parses OMML documents and renders formula trees. The parser's corpus
 * model and rejection outcomes are pinned in `test/formats/omml/`.
 * One physical entry per published subpath (ARCHITECTURE.md §3), so a
 * consumer rendering OMML does not pay for the AsciiMath grammar — proven by
 * the package-isolation gate against the built `dist`.
 *
 * `OmmlOptions` is exported because callers pass it; the XML element tree
 * behind it is not, being plumbing rather than public API (`src/xml/index.ts`).
 */

export type { UnitsmlRenderOptions } from "../../unitsml/index";
export { parseOmml } from "./parser";
export type { OmmlOptions } from "./renderer";
export { toOmml } from "./renderer";
