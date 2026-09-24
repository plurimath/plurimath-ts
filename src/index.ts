/**
 * `@plurimath/plurimath-ts` — the batteries-included entry.
 *
 * This entry intentionally pulls in everything; only the per-format subpaths
 * carry the slim-bundle guarantee (ARCHITECTURE.md §3). That is what lets the
 * compat class live here: it delegates to every renderer, so it cannot be
 * slim, and a consumer who wants slim imports a subpath instead.
 *
 * The constructor reads AsciiMath, LaTeX, HTML and UnicodeMath (named
 * `unicode`); the other two formats it names, MathML and OMML, still raise
 * `UnsupportedFormatError` (§4, §9).
 */

export { default as Plurimath, default, FORMATS, type Format } from "./compat/index";
export * from "./core/index";
// §3 rule 6: evaluation imports core only, and only this root entry re-exports
// it: `evaluate(formula, bindings)` takes a tree from any format's parser.
export * from "./evaluation/index";
