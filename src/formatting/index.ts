/**
 * `formatting` — the format-neutral leaf service (ARCHITECTURE.md §3).
 *
 * **What is here:** locale → decimal marker, and the parse-option policy that
 * turns a caller's `locale` into that marker or rejects it — plus, since B2's
 * first two slices (`number-format.ts`), the per-call `formatter:` render
 * option: decimal/group markers, integer- and fraction-side digit grouping,
 * and the numeric pipeline in `numbers/` (precision, significant digits, digit
 * count, padding, number sign), notation (`e`, `scientific`, `engineering`,
 * with `e`, `times` and `exponentSign`), and base notation (`base`, prefix,
 * postfix, hex capitalization). This is the shape, not the content: it exists
 * so a format's grammar and renderer can take these as parameters instead of
 * reaching for a global, and so the later work is filling in data rather
 * than restructuring rules.
 *
 * **What is not here, on purpose:** string formats, currency, and the rest of
 * the Ruby `Formatter::Numbers` port — see `number-format.ts`'s header and
 * `numbers/number-renderer.ts` (the seam they plug into). ARCHITECTURE.md §9
 * puts the rest in P4, and §10 lists `formatting` as "minimal normalization
 * in P1, locales and configurable formatters in P4+".
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
export type {
  FormatterOptions,
  FormatterSymbolOptions,
  MathmlNumber,
  NumberFormat,
} from "./number-format";
export {
  applyNumberFormat,
  formatNumberForMathml,
  formatNumberValue,
  isGemNumericValue,
  refuseNonNumericUnderFormatter,
  resolveNumberFormat,
} from "./number-format";
export type { FormattedNumber } from "./numbers/formatted-number";
export { formattedNumberText } from "./numbers/formatted-number";
export type { FormattedNotation } from "./numbers/notation";
export {
  formattedExponent,
  formattedNotationText,
  isFormattedNotation,
} from "./numbers/notation";
export type { TextTarget } from "./numbers/text-renderer";
