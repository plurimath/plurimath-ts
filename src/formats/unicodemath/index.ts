/**
 * `@plurimath/plurimath-ts/unicodemath` — the UnicodeMath subpath.
 *
 * Output only for now: the UnicodeMath *parser* arrives in P3, and this entry
 * grows a `parseUnicodemath` beside `toUnicodemath` when it does. One physical
 * entry per published subpath (ARCHITECTURE.md §3), so a consumer rendering
 * UnicodeMath does not pay for the AsciiMath grammar — proven by the
 * package-isolation gate against the built `dist`, not by import
 * convention.
 */

export type { UnicodemathOptions } from "./renderer";
export { toUnicodemath } from "./renderer";
