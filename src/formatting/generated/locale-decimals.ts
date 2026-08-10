/**
 * GENERATED FILE — do not edit, regenerate.
 *
 * Emitted by scripts/generate-formatting-data.rb from the Plurimath Ruby gem, the oracle
 * (ARCHITECTURE.md §1).
 * What it was generated from is in `src/formatting/generated/provenance.ts`.
 *
 * `Formatter::SupportedLocales::LOCALES`, projected onto its `decimal`
 * column, in the gem's declaration order — drift against a gem bump is a
 * straight diff. Read through the loaded gem, never off the source text,
 * and verified entry by entry before emission: `decimal_for` answers the
 * same marker for the Symbol and the String spelling of every key, and a
 * live `Math.parse` reads `1<marker>5` as a single Number under the
 * entry's own locale while refusing to under each of the other markers
 * the table holds.
 *
 * The `group` column is not carried: nothing at parse time reads it, and
 * the P4 `Formatter::Numbers` port owns that surface (ARCHITECTURE.md §9).
 */

/**
 * Ruby: `Plurimath::Configuration::DEFAULT_DECIMAL` — verified as what a
 * fresh `Configuration#decimal` serves and what a locale-less parse reads.
 */
export const DEFAULT_DECIMAL_MARKER = ".";

/**
 * Locale key -> decimal marker: 96 entries, 3 distinct
 * markers. `as const`, because `LocaleKey` — the closed union
 * `src/formatting/locales.ts` exports — is derived from these tuples' literal
 * types; a widened `string[][]` would silently reopen it.
 */
export const LOCALE_DECIMAL_MARKERS = [
  ["sr-Cyrl-ME", ","],
  ["sr-Latn-ME", ","],
  ["zh-Hant", "."],
  ["en-001", "."],
  ["en-150", "."],
  ["pt-PT", ","],
  ["nl-BE", ","],
  ["it-CH", "."],
  ["fr-BE", ","],
  ["fr-CA", ","],
  ["fr-CH", ","],
  ["de-AT", ","],
  ["de-CH", "."],
  ["en-AU", "."],
  ["en-CA", "."],
  ["en-GB", "."],
  ["en-IE", "."],
  ["en-IN", "."],
  ["en-NZ", "."],
  ["en-SG", "."],
  ["en-US", "."],
  ["en-ZA", "."],
  ["es-419", "."],
  ["es-AR", ","],
  ["es-CO", ","],
  ["es-MX", "."],
  ["es-US", "."],
  ["fil", "."],
  ["af", ","],
  ["ar", "٫"],
  ["az", ","],
  ["be", ","],
  ["bg", ","],
  ["bn", "."],
  ["bo", "."],
  ["bs", ","],
  ["ca", ","],
  ["cs", ","],
  ["cy", "."],
  ["da", ","],
  ["de", ","],
  ["el", ","],
  ["en", "."],
  ["eo", ","],
  ["es", ","],
  ["et", ","],
  ["eu", ","],
  ["fa", "٫"],
  ["fi", ","],
  ["fr", ","],
  ["ga", "."],
  ["gl", ","],
  ["gu", "."],
  ["he", "."],
  ["hi", "."],
  ["hr", ","],
  ["hu", ","],
  ["hy", ","],
  ["id", ","],
  ["is", ","],
  ["it", ","],
  ["ja", "."],
  ["ka", ","],
  ["kk", ","],
  ["km", ","],
  ["kn", "."],
  ["ko", "."],
  ["lo", ","],
  ["lt", ","],
  ["lv", ","],
  ["mk", ","],
  ["mr", "."],
  ["ms", "."],
  ["mt", "."],
  ["my", "."],
  ["nb", ","],
  ["nl", ","],
  ["pl", ","],
  ["pt", ","],
  ["ro", ","],
  ["ru", ","],
  ["sk", ","],
  ["sl", ","],
  ["sq", ","],
  ["sr", ","],
  ["sv", ","],
  ["sw", "."],
  ["ta", "."],
  ["th", "."],
  ["tr", ","],
  ["uk", ","],
  ["ur", "."],
  ["vi", ","],
  ["xh", "."],
  ["zh", "."],
  ["zu", "."],
] as const;
