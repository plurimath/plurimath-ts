/**
 * The `string_format:` keyword of `Formatter::Standard.new` — handed to
 * `NumberFormatter` as `localize_number:` and read by
 * `Formatter::Numbers::SymbolResolver#localize_number_symbols`
 * (`symbol_resolver.rb`). A template such as `"#,##0.### #"` does not shape
 * the number itself: the first match of `LOCALIZE_NUMBER_REGEX` anywhere in it
 * yields five symbol overrides, and `SymbolResolver#resolve` merges them LAST
 * — over the locale's entry and over the caller's `options` (Standard's
 * defaults included). A template the pattern does not match yields `{}` and
 * changes nothing.
 *
 * Measured on the oracle (v0.11.6, `00c52783`), rendering `1234567.1234567`:
 *
 *   - `"#,##0.## #"` answers `1,234,567.12 34 56 7` (U+00A0 between the
 *     fraction pairs: `normalize_space`);
 *   - `"#,##0.00"`, `"0.00"`, `"#,##0"`, `"#.###,##"` and `""` match nothing
 *     (the digits after the decimal must be `#`, and the integer side must end
 *     in `0`), so they answer the default `1,234,567.123'456'7`;
 *   - `"#0##0.##"` matches `"#0#"` + `"#0"` — decimal `"#"`, fraction group
 *     `"0"` — and answers `1234567#1020304050607`;
 *   - `"#,##0\r###"` takes `"\r"` as the decimal (Ruby's `.` excludes only
 *     `"\n"`), while `"#,##0\n###"` matches nothing.
 *
 * Only the template's own parse is here; applying it over the other symbol
 * layers is `resolveNumberFormat`'s (`./number-format.ts`).
 */

/**
 * `SymbolResolver::LOCALIZE_NUMBER_REGEX`, with two adjustments so JavaScript
 * matches what Ruby matches on the same string: the `u` flag makes `[^#]` one
 * code point, as a Ruby character is, and the decimal `.` is spelled `[^\n]`
 * because Ruby's `.` excludes only `"\n"` where JavaScript's also excludes
 * `"\r"`, U+2028 and U+2029.
 */
const LOCALIZE_NUMBER_PATTERN =
  /(?<group>[^#])?(?<groupdigits>#+0)(?<decimal>[^\n])(?<fractdigits>#+)(?<fractgroup>[^#])?/u;

/** The overrides one matching template yields (`localize_number_symbols`' hash). */
export interface StringFormatOverrides {
  readonly decimal: string;
  readonly groupDigits: number;
  readonly fractionGroupDigits: number;
  readonly group: string;
  readonly fractionGroup: string;
}

/** `SymbolResolver#normalize_space`: exactly one ASCII space becomes U+00A0. */
function normalizeSpace(value: string): string {
  return value === " " ? "\u00a0" : value;
}

/** Ruby's `String#size` — characters (code points), not UTF-16 units. */
function characterCount(value: string): number {
  return [...value].length;
}

/**
 * `SymbolResolver#localize_number_symbols` for a String template: the first
 * match anywhere in it, or `null` when there is none (the gem answers `{}`
 * and nothing is overridden).
 */
export function parseStringFormat(template: string): StringFormatOverrides | null {
  const groups = LOCALIZE_NUMBER_PATTERN.exec(template)?.groups;
  if (groups === undefined) return null;
  return {
    decimal: groups.decimal as string,
    groupDigits: characterCount(groups.groupdigits as string),
    fractionGroupDigits: characterCount(groups.fractdigits as string),
    group: normalizeSpace(groups.group ?? ""),
    fractionGroup: normalizeSpace(groups.fractgroup ?? ""),
  };
}
