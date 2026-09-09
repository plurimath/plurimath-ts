/**
 * `@plurimath/plurimath-ts/html` — the HTML subpath.
 *
 * Both directions now: the transform landed beside the grammar, and
 * ARCHITECTURE.md §3 is explicit that "a format subpath exports every function
 * that format owns — parsing *and* rendering when both exist". Everything else
 * under `formats/html/` — the grammar, the transform, the normaliser, the class
 * registry, `render-shared` — is internal: it is how these functions work, not
 * what a caller uses.
 *
 * One physical entry per published subpath (§3), so a consumer reading or
 * writing HTML does not pay for the AsciiMath or MathML slices — proven by the
 * package-isolation gate against the built `dist`, not by import convention.
 *
 * **What adding `parseHtml` costs, measured.** `dist/html-*.js` grows from
 * 80,481 to 204,992 bytes: the grammar, the transform's 1,436-entry symbol
 * table and 30-name class registry, the `core` node constructors the registry
 * binds, and `pegkit` itself. That is the same shape `./latex` already ships
 * (432,700 bytes for its two directions), and the gate's `pegkit/` ban on this
 * subpath — written when HTML was output-only — is lifted here rather than
 * worked around. A
 * consumer who only renders can still drop the parser: the package is
 * `sideEffects: false` and these are named ESM exports, so a downstream bundler
 * shakes `parseHtml` out of an app that never calls it.
 */

export type { HtmlParseOptions } from "./parser";
export { parseHtml } from "./parser";
export type { HtmlOptions } from "./renderer";
export { toHtml } from "./renderer";
