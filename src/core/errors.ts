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
