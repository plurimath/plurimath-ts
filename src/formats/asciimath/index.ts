/**
 * `@plurimath/plurimath-ts/asciimath` — the AsciiMath subpath.
 *
 * One physical entry per published subpath (ARCHITECTURE.md §3): a consumer
 * who only reads AsciiMath should not pay for the LaTeX or MathML renderers,
 * and source-level import rules cannot prove that on their own — the
 * package-isolation gate inspects the built `dist`, and its forbidden-import
 * table names what this subpath must never pull in.
 *
 * The surface is the two directions this format supports and the option types
 * that go with them. Everything else under `formats/asciimath/` — the grammar,
 * the transform, the preprocessor, `render-shared` — is internal: it is how
 * these functions work, not what a caller uses.
 */

export type { AsciimathParseOptions } from "./parser";
export { parseAsciimath } from "./parser";
export type { AsciimathOptions } from "./renderer";
export { toAsciimath } from "./renderer";
