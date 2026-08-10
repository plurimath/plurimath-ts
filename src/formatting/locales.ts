/**
 * Locale → decimal marker, and the parse-option policy around it.
 *
 * **Why this is a parse-time concern, not only a render-time one.** The gem
 * builds the AsciiMath `number` rule from `Plurimath.configuration.decimal`
 * (`lib/plurimath/asciimath/parse.rb:204`), and that method is called from two
 * places in the grammar — line 18 (the decimal-number rule) and line 86 (the
 * comma-separated rule). So a comma-decimal locale changes how **commas**
 * parse, not just how digits group. Measured against the oracle (v0.11.6,
 * `00c52783`, Ruby 4.0.1):
 *
 * ```text
 * parse("1,5", :asciimath)                => Number("1") Comma Number("5")
 * parse("1,5", :asciimath, locale: :de)   => Number("1,5")
 * parse("1.5", :asciimath, locale: :de)   => Number("1") Period Number("5")
 * parse("1,2,3", :asciimath, locale: :de) => Number("1,2") Comma Number("3")
 * ```
 *
 * `Asciimath::Parser` is constructed per parse and Parslet evaluates rule
 * bodies then, so the marker is effectively a per-parse input to the grammar.
 * A pegkit grammar therefore takes it as a **parameter** — the module boundary
 * this file exists to provide — rather than reading a global.
 *
 * **Deliberately minimal.** Number rendering, grouping separators, precision
 * and the rest of the Ruby `Formatter::Numbers` port are P4 scope
 * (ARCHITECTURE.md §9, §10). Only `decimal` is read here; the gem's `group`
 * column is not carried, because nothing at parse time reads it.
 *
 * **The data is generated, the policy is not.** The table and the default
 * marker come from `./generated/locale-decimals.ts`, emitted and verified per
 * entry by `scripts/generate-formatting-data.rb` — so a gem bump re-checks all
 * 96 entries instead of trusting a hand-typed copy. This file keeps what a
 * generator cannot own: the lookup/validation split and the option policy.
 */

import { UnsupportedLocaleError } from "./errors";
import { DEFAULT_DECIMAL_MARKER, LOCALE_DECIMAL_MARKERS } from "./generated/locale-decimals";

/**
 * Ruby: `Plurimath::Configuration::DEFAULT_DECIMAL` — generated alongside the
 * table and re-exported here, so the module's surface is unchanged from when
 * this file declared the value itself.
 */
export { DEFAULT_DECIMAL_MARKER };

/**
 * Every locale the gem accepts, as a closed union — derived from the generated
 * tuples' literal types, which is why `locale-decimals.ts` emits `as const`.
 *
 * 96 entries; exactly three distinct markers — `.`, `,` and U+066B ARABIC
 * DECIMAL SEPARATOR, used by `ar` and `fa`. That third one is the reason a
 * grammar must treat the marker as text rather than as "a dot or a comma", and
 * the reason `test/formatting/locales.spec.ts` asserts its code point rather
 * than trusting the glyph to survive a copy.
 */
export type LocaleKey = (typeof LOCALE_DECIMAL_MARKERS)[number][0];

const MARKER_BY_LOCALE: ReadonlyMap<string, string> = new Map(LOCALE_DECIMAL_MARKERS);

/** Ruby: `Formatter::SupportedLocales::LOCALES.keys`, same order. */
export const SUPPORTED_LOCALES: readonly LocaleKey[] = LOCALE_DECIMAL_MARKERS.map(
  (entry) => entry[0],
);

/**
 * Ruby: `SupportedLocales.key_for` reduced to what a TypeScript caller can
 * express. The Ruby version accepts a Symbol or a String and rejects anything
 * else (`key_for(42)` is `nil`, because `42.respond_to?(:to_sym)` is false);
 * TypeScript has one string type, so a string that names a key is the whole
 * accepting case. Matching is exact — `"DE"`, `"en-us"`, `"en_US"` and
 * `"  de  "` are all rejected by the gem, verified by probe.
 *
 * Takes `unknown` on purpose: this is the runtime gate, and a validator that
 * only accepts already-valid input is not one. JavaScript callers have no
 * types.
 */
export function isSupportedLocale(locale: unknown): locale is LocaleKey {
  return typeof locale === "string" && MARKER_BY_LOCALE.has(locale);
}

/** Ruby: `SupportedLocales.key_for` — the key, or `null` for anything else. */
export function localeKey(locale: unknown): LocaleKey | null {
  return isSupportedLocale(locale) ? locale : null;
}

/**
 * Ruby: `SupportedLocales.key_for!` — raises on an unsupported locale, but
 * lets nothing through. `key_for!(nil)` returns `nil` rather than raising
 * (`return locale_key if locale.nil? || locale_key`), so an explicitly empty
 * locale is legal and means "the default". `null` and `undefined` are both
 * that case here.
 *
 * @throws {UnsupportedLocaleError} for any present value that is not a key.
 */
export function requireLocaleKey(locale: unknown): LocaleKey | null {
  if (locale === null || locale === undefined) return null;

  const key = localeKey(locale);
  if (key === null) throw new UnsupportedLocaleError(locale, SUPPORTED_LOCALES);
  return key;
}

/**
 * Ruby: `SupportedLocales.decimal_for(locale, default:)`.
 *
 * **This never raises** — an unsupported locale falls back, it is not
 * rejected. That is a real and easily-missed split in the gem: the raise lives
 * in `Math.parse`'s option normalization, not in the lookup, so
 * `Plurimath.configure { |c| c.locale = :xx }` silently formats with `"."`
 * while `Math.parse(..., locale: :xx)` raises. Verified by probe:
 * `with_configuration { c.locale = :xx; parse("1,5", :asciimath) }` returns
 * `"1 , 5"` — the `en` reading — with no error.
 */
export function decimalMarkerFor(locale: unknown, fallback = DEFAULT_DECIMAL_MARKER): string {
  const key = localeKey(locale);
  if (key === null) return fallback;
  return MARKER_BY_LOCALE.get(key) ?? fallback;
}

/**
 * The locale half of any parse-option type. Formats that accept a locale spread
 * this into their own options interface; the gem's
 * `Math::LOCALIZED_PARSE_TYPES` — `[:asciimath, :html, :latex, :unicode]`,
 * confirmed by probe — says which those are. Enforcing *that* list belongs to
 * the root `parse` dispatcher (ARCHITECTURE.md §4), not to this module, which
 * is format-neutral by §3 and must not learn format names.
 */
export interface LocaleOptions {
  /**
   * A key from `SUPPORTED_LOCALES`. Omitted, `null` or `undefined` all mean
   * the default; anything else present and unsupported throws.
   */
  readonly locale?: string | null | undefined;
}

/**
 * The one call a grammar makes: parse options in, decimal marker out, with the
 * gem's validation already applied.
 *
 * Composes what `Math.parse` does across two steps — `normalize_parse_options`
 * (`key_for!`, which raises) and then `Configuration#decimal` (`decimal_for`,
 * which does not). Validation therefore happens here even though the lookup
 * that follows would have fallen back silently, because that is the order the
 * gem's public parse entry uses.
 *
 * There is no global configuration to consult (ARCHITECTURE.md §3 rule 7), so
 * "option absent" and "option null" collapse to the same default — which is
 * also what the gem does out of the box, its `Configuration#locale` being
 * `nil` until something sets it.
 *
 * @throws {UnsupportedLocaleError} for a present, unsupported locale.
 */
export function resolveDecimalMarker(options?: LocaleOptions | null): string {
  const key = requireLocaleKey(options?.locale);
  return key === null ? DEFAULT_DECIMAL_MARKER : decimalMarkerFor(key);
}
