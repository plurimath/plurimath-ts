/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-formatting-data.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 * What it was generated from is in `src/formatting/generated/provenance.ts`.
 *
 * `Formatter::SupportedLocales::LOCALES`, projected onto its `group`
 * column, in the gem's declaration order — the same order `./
 * locale-decimals.ts` keeps for the `decimal` column, so the two tables'
 * rows line up by index as well as by key.
 *
 * Nothing at PARSE time reads this column (only `decimal` feeds the
 * AsciiMath grammar), so it has no read-back-by-parse verification to
 * reuse. It is verified instead by a live RENDER call, and deliberately
 * NOT through `Formatter::Standard` — measured on the oracle,
 * `Formatter::Standard.new(locale: "de").localized_number("1234567")`
 * answers `"1,234,567"`, not the German `"1.234.567"`, because
 * `Standard#set_default_options` fills `:decimal`/`:group` from its own
 * `DEFAULT_OPTIONS` before the locale's entry is ever merged in, so a
 * `Standard` always renders the "en" symbols unless the caller passes
 * `decimal`/`group` explicitly. The base `Plurimath::NumberFormatter`
 * class has no such defaulting: given an empty `localizer_symbols:`
 * hash, it resolves symbols straight off this same `SupportedLocales`
 * entry, so that is the live call this generator verifies against —
 * rendering a seven-digit probe integer under the locale's own group
 * marker, and confirming none of the table's OTHER markers would have
 * produced the same rendering.
 */

/**
 * Ruby: `Formatter::Standard::DEFAULT_OPTIONS[:group]`, which agrees with
 * `Formatter::Numbers::FormatOptions::DEFAULT_GROUP` — verified as what a
 * default-options `Formatter::Standard` actually renders a multi-group
 * integer with.
 */
export const DEFAULT_GROUP_MARKER = ",";

/**
 * Locale key -> group marker: 96 entries, 6 distinct
 * markers. `as const`, for the same reason `./locale-decimals.ts` marks its
 * tuples `as const` — a widened `string[][]` would erase the literal types a
 * closed union could otherwise derive from these.
 */
export const LOCALE_GROUP_MARKERS = [
  ["sr-Cyrl-ME", "."],
  ["sr-Latn-ME", "."],
  ["zh-Hant", ","],
  ["en-001", ","],
  ["en-150", ","],
  ["pt-PT", "\u00a0"],
  ["nl-BE", "."],
  ["it-CH", "’"],
  ["fr-BE", "\u202f"],
  ["fr-CA", "\u00a0"],
  ["fr-CH", "\u202f"],
  ["de-AT", "\u00a0"],
  ["de-CH", "’"],
  ["en-AU", ","],
  ["en-CA", ","],
  ["en-GB", ","],
  ["en-IE", ","],
  ["en-IN", ","],
  ["en-NZ", ","],
  ["en-SG", ","],
  ["en-US", ","],
  ["en-ZA", ","],
  ["es-419", ","],
  ["es-AR", "."],
  ["es-CO", "."],
  ["es-MX", ","],
  ["es-US", ","],
  ["fil", ","],
  ["af", "\u00a0"],
  ["ar", "٬"],
  ["az", "."],
  ["be", "\u00a0"],
  ["bg", "\u00a0"],
  ["bn", ","],
  ["bo", ","],
  ["bs", "."],
  ["ca", "."],
  ["cs", "\u00a0"],
  ["cy", ","],
  ["da", "."],
  ["de", "."],
  ["el", "."],
  ["en", ","],
  ["eo", "\u00a0"],
  ["es", "."],
  ["et", "\u00a0"],
  ["eu", "."],
  ["fa", "٬"],
  ["fi", "\u00a0"],
  ["fr", "\u202f"],
  ["ga", ","],
  ["gl", "."],
  ["gu", ","],
  ["he", ","],
  ["hi", ","],
  ["hr", "."],
  ["hu", "\u00a0"],
  ["hy", "\u00a0"],
  ["id", "."],
  ["is", "."],
  ["it", "."],
  ["ja", ","],
  ["ka", "\u00a0"],
  ["kk", "\u00a0"],
  ["km", "."],
  ["kn", ","],
  ["ko", ","],
  ["lo", "."],
  ["lt", "\u00a0"],
  ["lv", "\u00a0"],
  ["mk", "."],
  ["mr", ","],
  ["ms", ","],
  ["mt", ","],
  ["my", ","],
  ["nb", "\u00a0"],
  ["nl", "."],
  ["pl", "\u00a0"],
  ["pt", "."],
  ["ro", "."],
  ["ru", "\u00a0"],
  ["sk", "\u00a0"],
  ["sl", "."],
  ["sq", "\u00a0"],
  ["sr", "."],
  ["sv", "\u00a0"],
  ["sw", ","],
  ["ta", ","],
  ["th", ","],
  ["tr", "."],
  ["uk", "\u00a0"],
  ["ur", ","],
  ["vi", "."],
  ["xh", "\u00a0"],
  ["zh", ","],
  ["zu", ","],
] as const;
