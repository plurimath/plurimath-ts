/**
 * `formatter.locale` is INERT on the oracle's `Formatter::Standard` (v0.11.6,
 * `00c52783`), and this port reproduces that on purpose (module header of
 * `src/formatting/number-format.ts`; defect logged in TODO.plan/deferred.md).
 * Measured on the oracle, `Standard.new(locale: L).to_<format>` of the number
 * `1234567.891234` answers `1,234,567.891'234` for L in "en", "de", "fr",
 * "de-CH", "ar", "xx", nil, 42, :de and "DE" — every locale the same bytes —
 * and `options: {decimal: ",", group: "."}` alone changes the symbols.
 * Values here are 1234567.89 -> `1,234,567.89` by the same measurement.
 *
 * The second half is the gem's `Source#validate_numeric!` under an active
 * formatter.
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../src/core/errors";
import { toAsciimath } from "../../src/formats/asciimath/index";
import { toHtml } from "../../src/formats/html/index";
import { toLatex } from "../../src/formats/latex/index";
import { toUnicodemath } from "../../src/formats/unicodemath/index";
import type { FormatterOptions } from "../../src/formatting/index";

/** A bare `Number` node, built directly rather than through the corpus reader. */
function numberNode(value: string | null): never {
  return { kind: "number", value } as never;
}

describe("formatter.locale is inert, as on the oracle's Formatter::Standard", () => {
  const Oen = "1,234,567.89";

  it("renders every locale with the en symbols (de: the oracle answers 1,234,567.891'234)", () => {
    const node = numberNode("1234567.89");
    for (const locale of ["en", "de", "fr", "en-GB", "de-CH", "it-CH", "ar", "fa", "pt-PT"]) {
      const formatter: FormatterOptions = { locale };
      expect(toAsciimath(node, { formatter }), locale).toBe(Oen);
      expect(toLatex(node, { formatter }), locale).toBe(Oen);
      expect(toHtml(node, { formatter }), locale).toBe(Oen);
      expect(toUnicodemath(node, { formatter }), locale).toBe(Oen);
    }
  });

  it("does not refuse an unknown or non-string locale: the gem falls back to en", () => {
    // NumberFormatter#supported_locale: "Locale always falls back to :en for any
    // unsupported value, including nil and non-string/symbol types; it never raises."
    const node = numberNode("1234567.89");
    for (const locale of ["xx-not-a-locale", "DE", "en_US", "", null, 42, {}]) {
      const formatter = { locale } as FormatterOptions;
      expect(toAsciimath(node, { formatter }), String(locale)).toBe(Oen);
    }
  });

  it("does not layer a locale's group size or fraction group either (fr, group_digits: 2)", () => {
    // Oracle: Standard.new(locale: "fr", options: {group_digits: 2}) -> "1,23,45,67.891'234".
    const formatter: FormatterOptions = { locale: "fr", options: { groupDigits: 2 } };
    expect(toAsciimath(numberNode("1234567.891234"), { formatter })).toBe("1,23,45,67.891'234");
  });

  it("changes symbols only through formatter.options, whatever the locale", () => {
    // Oracle: locale "de" + options {decimal: ",", group: "."} -> "1.234.567,891'234";
    // {decimal: ";"} alone -> "1,234,567;891'234"; {group: "_"} alone -> "1_234_567.891'234".
    const node = numberNode("1234567.891234");
    const both: FormatterOptions = { locale: "de", options: { decimal: ",", group: "." } };
    expect(toAsciimath(node, { formatter: both })).toBe("1.234.567,891'234");
    expect(toAsciimath(node, { formatter: { locale: "de", options: { decimal: ";" } } })).toBe(
      "1,234,567;891'234",
    );
    expect(toAsciimath(node, { formatter: { locale: "de", options: { group: "_" } } })).toBe(
      "1_234_567.891'234",
    );
    const overridden: FormatterOptions = { locale: "de", options: { decimal: "#", group: "@" } };
    expect(toAsciimath(numberNode("1234567.89"), { formatter: overridden })).toBe("1@234@567#89");
  });

  it("still defaults to en's symbols when no locale is given at all", () => {
    const formatter: FormatterOptions = {};
    expect(toAsciimath(numberNode("1234567.89"), { formatter })).toBe(Oen);
  });
});

describe("non-numeric values under an active formatter now refuse", () => {
  const formatter: FormatterOptions = {};

  it("refuses a value that fails the gem's NUMERIC_PATTERN (asciimath)", () => {
    expect(() => toAsciimath(numberNode("abc"), { formatter })).toThrow(RenderError);
  });

  it("refuses the same value on every text renderer this slice covers", () => {
    for (const render of [toAsciimath, toLatex, toHtml, toUnicodemath]) {
      expect(() => render(numberNode("abc"), { formatter } as never)).toThrow(RenderError);
    }
  });

  it("refuses an empty string — nil.to_s in the gem, which also fails the pattern", () => {
    expect(() => toAsciimath(numberNode(null), { formatter })).toThrow(RenderError);
  });

  it("refuses whitespace and partial-number junk the same way", () => {
    for (const junk of [" ", "1,5", "12.3.4", "+", "-", "1e", "abc123"]) {
      expect(() => toAsciimath(numberNode(junk), { formatter })).toThrow(RenderError);
    }
  });

  it("formats a value the gem accepts but the plain digit shape does not cover", () => {
    // Negative numbers and scientific notation pass Source::NUMERIC_PATTERN
    // and go through the same numeric pipeline (measured on the oracle,
    // 00c52783: Formatter::Standard renders "-5" as "-5" and "1.5e10" as
    // "15,000,000,000").
    expect(toAsciimath(numberNode("-5"), { formatter })).toBe("-5");
    expect(toAsciimath(numberNode("1.5e10"), { formatter })).toBe("15,000,000,000");
  });

  it("does not refuse a non-numeric value when no formatter is active at all", () => {
    // Unchanged no-formatter path: the raw value renders exactly as the
    // whole pinned corpus was generated.
    expect(toAsciimath(numberNode("abc"))).toBe("abc");
    expect(toAsciimath(numberNode(null))).toBe("");
  });
});
