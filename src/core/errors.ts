/**
 * The public error contract (ARCHITECTURE.md §5).
 *
 * `code` is the guaranteed discriminator, not `instanceof`: this package ships
 * both ESM and CJS builds, and an application that loads both would hold two
 * copies of these classes, so cross-copy `instanceof` silently fails. A string
 * comparison never does. Message text is never API.
 */

export type PlurimathErrorCode =
  | "PARSE_ERROR"
  | "UNSUPPORTED_FORMAT"
  | "MISSING_SYMBOL_DATA"
  | "RENDER_ERROR";

export abstract class PlurimathError extends Error {
  abstract readonly code: PlurimathErrorCode;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ParseError extends PlurimathError {
  readonly code = "PARSE_ERROR" as const;

  constructor(
    message: string,
    readonly input: string,
    readonly format: string,
    /** UTF-16 code-unit offset into the ORIGINAL input (never the preprocessed form). */
    readonly index: number,
  ) {
    super(message);
  }
}

export class UnsupportedFormatError extends PlurimathError {
  readonly code = "UNSUPPORTED_FORMAT" as const;

  constructor(readonly format: string) {
    super(`Format "${format}" is not supported`);
  }
}

export class MissingSymbolDataError extends PlurimathError {
  readonly code = "MISSING_SYMBOL_DATA" as const;

  constructor(
    readonly symbolId: string,
    readonly format: string,
  ) {
    super(`No ${format} representation for symbol "${symbolId}"`);
  }
}

export class RenderError extends PlurimathError {
  readonly code = "RENDER_ERROR" as const;

  constructor(
    message: string,
    readonly format: string,
    readonly kind: string,
  ) {
    super(message);
  }
}

/**
 * Describes a caught throw for an error message. `String(error)` runs the
 * thrown value's own `toString` — input code, which can itself throw — and a
 * boundary that lets that secondary throw out leaks the raw value it exists
 * to wrap, so the description falls back to a fixed phrase instead. Shared by
 * every wrap that stringifies a caught value (the shape validator's read-site
 * and entry-point wraps, the renderers' mid-walk wrap); module-internal
 * vocabulary, deliberately not re-exported from the core barrel — message
 * text is never API.
 */
export function describeThrown(error: unknown): string {
  try {
    return String(error);
  } catch {
    return "a thrown value that cannot be described";
  }
}
