/**
 * Locale → decimal marker parity with the oracle (plurimath v0.11.6,
 * `00c52783`, Ruby 4.0.1, Ox).
 *
 * Every expectation here is a value the gem printed, not a value read off its
 * source. Each came from a one-off probe of the shape
 *
 * ```ruby
 * Plurimath::Formatter::SupportedLocales.decimal_for(locale, default: ".")
 * Plurimath::Math.parse("1,5", :asciimath, locale: locale).to_asciimath
 * ```
 *
 * run through `bundle exec ruby -Ilib` in the pinned oracle checkout.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_DECIMAL_MARKER,
  decimalMarkerFor,
  isSupportedLocale,
  type LocaleOptions,
  localeKey,
  requireLocaleKey,
  resolveDecimalMarker,
  SUPPORTED_LOCALES,
  UnsupportedLocaleError,
} from "../../src/formatting/index";

/** U+066B ARABIC DECIMAL SEPARATOR — the `ar`/`fa` marker. */
const ARABIC_DECIMAL_SEPARATOR = String.fromCodePoint(0x066b);

describe("the default", () => {
  it("is the gem's DEFAULT_DECIMAL", () => {
    // Plurimath::Configuration::DEFAULT_DECIMAL => "."
    expect(DEFAULT_DECIMAL_MARKER).toBe(".");
  });

  it("applies when no locale is given at all", () => {
    // Plurimath.configuration.locale => nil; .decimal => "."
    expect(resolveDecimalMarker()).toBe(".");
    expect(resolveDecimalMarker({})).toBe(".");
    expect(resolveDecimalMarker(null)).toBe(".");
  });

  it("applies when the locale is explicitly empty", () => {
    // key_for!(nil) => nil (it does NOT raise), then decimal_for(nil) => "."
    expect(resolveDecimalMarker({ locale: null })).toBe(".");
    expect(resolveDecimalMarker({ locale: undefined })).toBe(".");
    expect(requireLocaleKey(null)).toBeNull();
    expect(requireLocaleKey(undefined)).toBeNull();
  });
});

describe("supported locales", () => {
  /**
   * Parity table. Left column: `decimal_for(locale, default: ".")` in the gem.
   * Right two columns: what `Math.parse(text, :asciimath, locale:)` produced,
   * kept as a comment because the grammar that consumes the marker is TODO 4 —
   * this suite proves the marker, and TODO 4 proves the parse.
   *
   *   locale     gem decimal   parse("1,5")            parse("1.5")
   *   en         "."           Number 1, Comma, 5      Number "1.5"
   *   en-US      "."           Number 1, Comma, 5      Number "1.5"
   *   zh-Hant    "."           Number 1, Comma, 5      Number "1.5"
   *   it-CH      "."           Number 1, Comma, 5      Number "1.5"
   *   de         ","           Number "1,5"            Number 1, Period, 5
   *   fr         ","           Number "1,5"            Number 1, Period, 5
   *   es-AR      ","           Number "1,5"            Number 1, Period, 5
   *   sr-Cyrl-ME ","           Number "1,5"            Number 1, Period, 5
   *   ar         U+066B        Number 1, Comma, 5      Number 1, Period, 5
   *   fa         U+066B        Number 1, Comma, 5      Number 1, Period, 5
   */
  const parity: ReadonlyArray<readonly [string, string]> = [
    ["en", "."],
    ["en-US", "."],
    ["en-GB", "."],
    ["zh-Hant", "."],
    ["it-CH", "."],
    ["de-CH", "."],
    ["es-MX", "."],
    ["ja", "."],
    ["de", ","],
    ["fr", ","],
    ["es", ","],
    ["es-AR", ","],
    ["sr-Cyrl-ME", ","],
    ["sr-Latn-ME", ","],
    ["pt-PT", ","],
    ["de-AT", ","],
    ["ar", ARABIC_DECIMAL_SEPARATOR],
    ["fa", ARABIC_DECIMAL_SEPARATOR],
  ];

  it.each(parity)("resolves %s to the gem's marker", (locale, marker) => {
    expect(decimalMarkerFor(locale)).toBe(marker);
    expect(resolveDecimalMarker({ locale })).toBe(marker);
  });

  it("keeps the Arabic separator a single non-ASCII code point", () => {
    // The gem's table holds "٫", not "." — a marker a grammar cannot hardcode.
    const marker = decimalMarkerFor("ar");
    expect(marker).toHaveLength(1);
    expect(marker.codePointAt(0)).toBe(0x066b);
    expect(marker).not.toBe(".");
    expect(marker).not.toBe(",");
  });

  it("does not quietly hand a comma-decimal locale the default", () => {
    // The mutation this suite exists to catch: a table that fell back to "."
    // would leave "1,5" parsing as three nodes under :de.
    for (const locale of ["de", "fr", "es", "ru", "pl", "tr", "it", "nl"]) {
      expect(decimalMarkerFor(locale)).toBe(",");
    }
  });

  it("carries the whole gem table, not a useful subset", () => {
    // Formatter::SupportedLocales::LOCALES.size => 96
    expect(SUPPORTED_LOCALES).toHaveLength(96);
    expect(new Set(SUPPORTED_LOCALES).size).toBe(96);
  });

  it("has exactly the three markers the gem's table contains", () => {
    // LOCALES.values.map { |v| v[:decimal] }.uniq => [",", ".", "٫"]
    const markers = new Set(SUPPORTED_LOCALES.map((locale) => decimalMarkerFor(locale)));
    expect([...markers].sort()).toEqual([",", ".", ARABIC_DECIMAL_SEPARATOR].sort());
  });

  it("preserves the gem's declaration order, so drift is a straight diff", () => {
    expect(SUPPORTED_LOCALES[0]).toBe("sr-Cyrl-ME");
    expect(SUPPORTED_LOCALES[27]).toBe("fil");
    expect(SUPPORTED_LOCALES[95]).toBe("zu");
  });

  it("gives every listed locale a marker and a key", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(isSupportedLocale(locale)).toBe(true);
      expect(localeKey(locale)).toBe(locale);
      expect(requireLocaleKey(locale)).toBe(locale);
      expect(decimalMarkerFor(locale)).not.toBe("");
    }
  });
});

describe("unsupported locales", () => {
  /**
   * The gem matches its keys exactly: no case folding, no separator
   * normalization, no trimming. Each of these raised
   * `Plurimath::Errors::UnsupportedLocale` from
   * `Plurimath::Math.parse("1.5", :asciimath, locale: …)`.
   */
  const rejected: readonly unknown[] = [
    "xx",
    "DE",
    "De",
    "en-us",
    "en_US",
    "  de  ",
    "",
    "en-XX",
    42,
    true,
    [],
    {},
  ];

  it.each(rejected.map((locale) => [locale] as const))("rejects %o", (locale) => {
    expect(() => requireLocaleKey(locale)).toThrow(UnsupportedLocaleError);
    expect(() => resolveDecimalMarker({ locale } as LocaleOptions)).toThrow(UnsupportedLocaleError);
    expect(isSupportedLocale(locale)).toBe(false);
    expect(localeKey(locale)).toBeNull();
  });

  it("reports the rejected value and the supported set on the error", () => {
    let caught: UnsupportedLocaleError | undefined;
    try {
      resolveDecimalMarker({ locale: "en-us" });
    } catch (error) {
      caught = error as UnsupportedLocaleError;
    }

    expect(caught).toBeInstanceOf(UnsupportedLocaleError);
    expect(caught).toBeInstanceOf(Error);
    expect(caught?.code).toBe("UNSUPPORTED_LOCALE");
    expect(caught?.name).toBe("UnsupportedLocaleError");
    expect(caught?.locale).toBe("en-us");
    expect(caught?.supportedLocales).toBe(SUPPORTED_LOCALES);
    expect(caught?.stack).toBeDefined();
  });

  it("names the value in the message without needing the message parsed", () => {
    // Message text is never API (core/errors.ts); this only guards against an
    // error that says nothing useful.
    expect(new UnsupportedLocaleError("xx", ["en"]).message).toContain('"xx"');
    expect(new UnsupportedLocaleError(42, ["en"]).message).toContain("42");
  });

  /**
   * The split that is easy to miss. The gem raises from `Math.parse`'s option
   * normalization (`key_for!`), NOT from the lookup — so the lookup falls back
   * silently. Verified:
   *
   *   Plurimath.with_configuration { |c| c.locale = :xx
   *     Plurimath::Math.parse("1,5", :asciimath).to_asciimath }  # => "1 , 5"
   *
   * i.e. an unsupported locale set on the configuration formats as `en` with
   * no error at all.
   */
  it("falls back rather than raising on the non-validating lookup", () => {
    expect(decimalMarkerFor("xx")).toBe(".");
    expect(decimalMarkerFor(42)).toBe(".");
    expect(decimalMarkerFor(null)).toBe(".");
    expect(decimalMarkerFor("de")).toBe(",");
  });

  it("honours an explicit fallback on that lookup", () => {
    // decimal_for(locale, default:) — the default is a parameter in the gem too.
    expect(decimalMarkerFor("xx", "!")).toBe("!");
    expect(decimalMarkerFor("de", "!")).toBe(",");
  });
});
