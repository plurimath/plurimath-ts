/**
 * `@plurimath/plurimath-ts` — the batteries-included entry.
 *
 * This entry intentionally pulls in everything; only the per-format subpaths
 * carry the slim-bundle guarantee (ARCHITECTURE.md §3). The compat class and
 * `parse()` arrive with the first input format — see §4 and §9. Until then the
 * root re-exports the model layer so the package has a coherent surface at
 * every milestone.
 */

export * from "./core/index";
