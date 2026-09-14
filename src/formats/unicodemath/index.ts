/**
 * `@plurimath/plurimath-ts/unicodemath` — the UnicodeMath subpath.
 *
 * Both directions, as ARCHITECTURE.md §3 requires of a format subpath: it
 * exports every function the format owns, "parsing *and* rendering when both
 * exist". They exist now — `parseUnicodemath` is the P3 entry point — so this
 * barrel carries both.
 *
 * One physical entry per published subpath (§3), so a consumer rendering
 * UnicodeMath does not pay for the AsciiMath grammar — proven by the
 * package-isolation gate against the built `dist`, not by import convention.
 * That gate's `./unicodemath` row admits `pegkit` from this slice onward, for
 * the same reason its `./latex` row does: the format has an input side, and the
 * parser combinators are how it parses.
 */

export type { UnicodemathParseOptions } from "./parser";
export { parseUnicodemath } from "./parser";
export type { UnicodemathOptions } from "./renderer";
export { toUnicodemath } from "./renderer";
