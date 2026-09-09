/**
 * `@plurimath/plurimath-ts/html` — the HTML subpath.
 *
 * Output only: one physical entry per published subpath (ARCHITECTURE.md §3),
 * so a consumer rendering HTML does not pay for a parser or another renderer.
 * The package-isolation gate proves that against the built `dist`.
 */

export type { HtmlOptions } from "./renderer";
export { toHtml } from "./renderer";
