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
  | "UNSUPPORTED_FEATURE"
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

/**
 * A surface this port declares but has not implemented yet.
 *
 * Distinct from `UnsupportedFormatError`, which is about an input FORMAT and
 * carries the format token in `format`. This is about a FEATURE — the compat
 * class's `toDisplay`, or `toMathml(intent: true)` — where no format token
 * describes what was refused, and where a consumer branching on `code` wants
 * to tell "this port cannot do that yet" apart from "that is not a format".
 *
 * `DECISIONS.md` records this class as rejected once, for having no consumer
 * after the grammar rule that would have raised it was commented out. The
 * compat surface gives it two, which is the new evidence that file asks for
 * before a rejected decision is reopened.
 */
export class UnsupportedFeatureError extends PlurimathError {
  readonly code = "UNSUPPORTED_FEATURE" as const;

  /** A stable identifier for the feature, never prose. */
  constructor(
    readonly feature: string,
    detail: string,
  ) {
    super(`${feature} is not supported yet: ${detail}`);
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
