/**
 * `formatting` — the format-neutral leaf service (ARCHITECTURE.md §3).
 *
 * **What is here:** locale → decimal marker, and the parse-option policy that
 * turns a caller's `locale` into that marker or rejects it. This is the shape,
 * not the content: it exists so the AsciiMath grammar (TODO 4) can take the
 * marker as a parameter instead of reaching for a global, and so the later
 * work is filling in data rather than restructuring rules.
 *
 * **What is not here, on purpose:** number rendering, grouping separators,
 * precision, currency, and the rest of the Ruby `Formatter::Numbers` port.
 * ARCHITECTURE.md §9 puts those in P4, and §10 lists `formatting` as "minimal
 * normalization in P1, locales and configurable formatters in P4+".
 *
 * Imports nothing internal, per §3's module map.
 */

export type { FormattingErrorCode } from "./errors";
export { UnsupportedLocaleError } from "./errors";
export type { LocaleKey, LocaleOptions } from "./locales";
export {
  DEFAULT_DECIMAL_MARKER,
  decimalMarkerFor,
  isSupportedLocale,
  localeKey,
  requireLocaleKey,
  resolveDecimalMarker,
  SUPPORTED_LOCALES,
} from "./locales";
