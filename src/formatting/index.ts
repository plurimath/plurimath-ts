/**
 * `formatting` — the format-neutral leaf service (ARCHITECTURE.md §3).
 *
 * **What is here:** locale → decimal marker, and the parse-option policy that
 * turns a caller's `locale` into that marker or rejects it — plus, since B2's
 * first slice (`number-format.ts`), the per-call `formatter:` render option's
 * default-symbol behavior: decimal/group markers and integer-side digit
 * grouping only. This is the shape, not the content: it exists so a format's
 * grammar and renderer can take these as parameters instead of reaching for a
 * global, and so the later work is filling in data rather than restructuring
 * rules.
 *
 * **What is not here, on purpose:** precision, significant digits, notation,
 * base notation, sign handling, fraction-side grouping, currency, and the
 * rest of the Ruby `Formatter::Numbers` port — see `number-format.ts`'s
 * header for exactly what this slice does and does not cover. ARCHITECTURE.md
 * §9 puts the rest in P4, and §10 lists `formatting` as "minimal
 * normalization in P1, locales and configurable formatters in P4+".
 *
 * Imports only `core`, per §3's module map (rule 2).
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
export type { FormatterOptions, FormatterSymbolOptions, NumberFormat } from "./number-format";
export {
  applyNumberFormat,
  isPlainFormattableNumber,
  resolveNumberFormat,
} from "./number-format";
