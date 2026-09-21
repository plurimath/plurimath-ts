/**
 * The two scope-narrowing calls this repository's reviewer rejected from
 * B2's first formatter slice (683339f) as too narrow, now widened:
 *
 *   1. `formatter.locale` accepts any of the 96 locales `formatting/
 *      locales.ts` knows, not only `"en"`, sourcing its own decimal/group
 *      defaults from the generated tables (`../../src/formatting/generated/
 *      locale-decimals.ts`, `.../locale-groups.ts`).
 *   2. A value that fails the gem's `Formatter::Numbers::
 *      Source#validate_numeric!` under an active formatter now raises,
 *      where the first slice rendered it unformatted.
 *
 * Every rendered expectation below is computed independently in the comment
 * next to it (locale marker × the grouping this slice implements —
 * `Integer#format_groups`'s right-to-left chop, default `group_digits: 3`),
 * not copied from the implementation under test.
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

describe("widened locale support", () => {
  // de: decimal ",", group "." (Formatter::SupportedLocales::LOCALES[:de]).
  it("renders under a comma-decimal, dot-group locale (de)", () => {
    const formatter: FormatterOptions = { locale: "de" };
    const node = numberNode("1234567.89");
    expect(toAsciimath(node, { formatter })).toBe("1.234.567,89");
    expect(toLatex(node, { formatter })).toBe("1.234.567,89");
    expect(toHtml(node, { formatter })).toBe("1.234.567,89");
    expect(toUnicodemath(node, { formatter })).toBe("1.234.567,89");
  });

  // en-GB: decimal ".", group "," — same symbols as "en", proving a
  // non-"en" key still resolves rather than only widening the refusal.
  it("renders under a dot-decimal, comma-group locale that is not en (en-GB)", () => {
    const formatter: FormatterOptions = { locale: "en-GB" };
    expect(toAsciimath(numberNode("1234567.89"), { formatter })).toBe("1,234,567.89");
  });

  // it-CH: decimal ".", group "’" (U+2019 RIGHT SINGLE QUOTATION MARK).
  it("renders under a locale whose group marker is not ASCII punctuation (it-CH)", () => {
    const formatter: FormatterOptions = { locale: "it-CH" };
    expect(toLatex(numberNode("1234567.89"), { formatter })).toBe("1’234’567.89");
  });

  // ar: decimal U+066B, group U+066C — both non-ASCII, and distinct from
  // each other, so a swap of the two would still fail this.
  it("renders under a locale with non-ASCII decimal AND group markers (ar)", () => {
    const formatter: FormatterOptions = { locale: "ar" };
    const rendered = toHtml(numberNode("1234567.89"), { formatter });
    expect(rendered).toBe(
      `1${String.fromCodePoint(0x066c)}234${String.fromCodePoint(0x066c)}567` +
        `${String.fromCodePoint(0x066b)}89`,
    );
  });

  it("still lets formatter.options override the locale's own defaults", () => {
    // Same layering the gem's SymbolResolver documents: locale supplies
    // defaults, explicit options win.
    const formatter: FormatterOptions = { locale: "de", options: { decimal: "#", group: "@" } };
    expect(toAsciimath(numberNode("1234567.89"), { formatter })).toBe("1@234@567#89");
  });

  it("still refuses a locale outside the gem's 96-entry table", () => {
    const formatter = { locale: "xx-not-a-locale" } as FormatterOptions;
    expect(() => toAsciimath(numberNode("5"), { formatter })).toThrow(RenderError);
    expect(() => toAsciimath(numberNode("5"), { formatter })).toThrow(/formatter\.locale/);
  });

  it("still defaults to en's symbols when no locale is given at all", () => {
    const formatter: FormatterOptions = {};
    expect(toAsciimath(numberNode("1234567.89"), { formatter })).toBe("1,234,567.89");
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
