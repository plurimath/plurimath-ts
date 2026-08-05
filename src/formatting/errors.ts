/**
 * Errors this leaf service raises.
 *
 * `code` is the discriminator, not `instanceof` — the same reasoning as
 * `core/errors.ts`: the package ships ESM and CJS, and an application loading
 * both holds two copies of every class, so cross-copy `instanceof` silently
 * fails. Message text is never API.
 *
 * This class deliberately does **not** extend `core`'s `PlurimathError`.
 * ARCHITECTURE.md §3's module map says `formatting/` imports nothing internal,
 * and `PlurimathError#code` is typed as the closed `PlurimathErrorCode` union,
 * which has no locale member. Adding one is a `core` edit; until it happens
 * this class matches the shape (string `code`, `name` from the constructor)
 * without the inheritance.
 */

/** Ruby: `Plurimath::Errors::UnsupportedLocale`. */
export type FormattingErrorCode = "UNSUPPORTED_LOCALE";

/**
 * Renders a rejected locale for the message the way Ruby's `inspect` does for
 * the common case, so `"xx"` and `xx` are distinguishable in a report.
 */
function describeLocale(locale: unknown): string {
  return typeof locale === "string" ? JSON.stringify(locale) : String(locale);
}

/**
 * Thrown when a caller asks to parse under a locale the gem's table does not
 * contain. Mirrors `Plurimath::Errors::UnsupportedLocale`, which the gem raises
 * from `Math.parse` → `SupportedLocales.key_for!` **before** parsing starts —
 * so it is not wrapped in a `ParseError`, and neither is this.
 *
 * Verified against the oracle (v0.11.6, `00c52783`):
 * `Plurimath::Math.parse("1.5", :asciimath, locale: "xx")` raises
 * `Plurimath::Errors::UnsupportedLocale`, `e.is_a?(Plurimath::Math::ParseError)`
 * is `false` and `e.cause` is `nil`.
 */
export class UnsupportedLocaleError extends Error {
  readonly code: FormattingErrorCode = "UNSUPPORTED_LOCALE";

  constructor(
    /** Exactly what the caller passed, including non-string values. */
    readonly locale: unknown,
    readonly supportedLocales: readonly string[],
  ) {
    super(
      `Unsupported locale ${describeLocale(locale)}. ` +
        `Supported locales are: ${supportedLocales.join(", ")}.`,
    );
    this.name = "UnsupportedLocaleError";
  }
}
