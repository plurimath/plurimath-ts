/**
 * `@plurimath/plurimath-ts` — the batteries-included entry.
 *
 * This entry intentionally pulls in everything; only the per-format subpaths
 * carry the slim-bundle guarantee (ARCHITECTURE.md §3). That is what lets the
 * compat class live here: it delegates to every renderer, so it cannot be
 * slim, and a consumer who wants slim imports a subpath instead.
 *
 * `parse()` still arrives with the first non-AsciiMath input format (§4, §9).
 */

export { default as Plurimath, default, FORMATS, type Format } from "./compat/index";
export * from "./core/index";
