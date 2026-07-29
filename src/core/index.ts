/**
 * `@plurimath/plurimath-ts/core` — the format-blind model layer.
 *
 * Nodes, errors and diagnostics live here; parse and render logic never does.
 * This surface is experimental through the `0.x` line and locks at `1.0`
 * (ARCHITECTURE.md §5).
 */

export type { DeferredFeature, OnUnsupported, UnsupportedDiagnostic } from "./diagnostics";
export { reportUnsupported, resetUnsupportedWarnings } from "./diagnostics";
export type { PlurimathErrorCode } from "./errors";
export {
  MissingSymbolDataError,
  ParseError,
  PlurimathError,
  RenderError,
  UnsupportedFormatError,
} from "./errors";
