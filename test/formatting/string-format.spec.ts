/**
 * `formatter.stringFormat` — the gem's `string_format:` template
 * (`src/formatting/string-format.ts`): measured cases rendered through a whole
 * formula for all six targets (`string-format-cases.ts`, command in its
 * header), the template parse on its own, and the option's validation. The
 * two pinned `calls/1` string_format cases run with every other pinned case
 * in `number-formatter-numeric-pipeline.spec.ts`.
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../src/core/errors";
import { FormulaNode, NumberNode } from "../../src/core/nodes";
import { toAsciimath } from "../../src/formats/asciimath/index";
import { toHtml } from "../../src/formats/html/index";
import { toLatex } from "../../src/formats/latex/index";
import { toMathml } from "../../src/formats/mathml/index";
import { toOmml } from "../../src/formats/omml/index";
import { toUnicodemath } from "../../src/formats/unicodemath/index";
import { type FormatterOptions, resolveNumberFormat } from "../../src/formatting/index";
import { parseStringFormat } from "../../src/formatting/string-format";
import { MEASURED, type PerTarget } from "./string-format-cases";

function formula(value: string): FormulaNode {
  return new FormulaNode({ value: [new NumberNode({ value })] });
}

function compact(xml: string): string {
  return xml.replace(/>\s+</g, "><");
}

function inside(xml: string, pattern: RegExp): string {
  const match = pattern.exec(compact(xml));
  if (match === null) throw new Error(`no match for ${pattern} in ${xml}`);
  return match[1] as string;
}

function escapeXml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function expectedFor(expected: string | PerTarget): PerTarget {
  if (typeof expected !== "string") return expected;
  const xml = escapeXml(expected);
  return {
    asciimath: expected,
    latex: expected,
    html: expected,
    unicodemath: expected,
    mathml: `<mn>${xml}</mn>`,
    omml: `<m:r><m:t>${xml}</m:t></m:r>`,
  };
}

describe("measured string_format cases", () => {
  it("has 50 or more cases, matching and non-matching templates among them", () => {
    // Counts are measured: this is the length of the generated table.
    expect(MEASURED.length).toBeGreaterThanOrEqual(50);
    const templates = MEASURED.map(([, formatter]) => formatter.stringFormat ?? null);
    expect(templates.some((t) => t !== null && parseStringFormat(t) !== null)).toBe(true);
    expect(templates.some((t) => t !== null && parseStringFormat(t) === null)).toBe(true);
  });

  it.each(MEASURED.map((row) => [row[0], JSON.stringify(row[1]), row] as const))(
    "%s with %s renders like the oracle in every target",
    (_value, _formatter, [value, formatter, expected]) => {
      const want = expectedFor(expected);
      const node = formula(value);
      expect(toAsciimath(node, { formatter })).toBe(want.asciimath);
      expect(toLatex(node, { formatter })).toBe(want.latex);
      expect(toHtml(node, { formatter })).toBe(want.html);
      expect(toUnicodemath(node, { formatter })).toBe(want.unicodemath);
      expect(
        inside(toMathml(node, { formatter }), /<mstyle displaystyle="true">(.*)<\/mstyle>/s),
      ).toBe(want.mathml);
      expect(inside(toOmml(node, { formatter }), /<m:oMath>(.*)<\/m:oMath>/s)).toBe(want.omml);
    },
  );
});

describe("parseStringFormat (SymbolResolver#localize_number_symbols)", () => {
  it("reads the five overrides from the first match, U+00A0 for a single space", () => {
    expect(parseStringFormat("#,##0.### #")).toStrictEqual({
      decimal: ".",
      groupDigits: 3,
      fractionGroupDigits: 3,
      group: ",",
      fractionGroup: "\u00a0",
    });
  });

  it("answers null for a template the pattern does not match", () => {
    for (const template of ["", "#,##0.00", "0.00", "#,##0", "#.###,##", "#,##0\n###"]) {
      expect(parseStringFormat(template), JSON.stringify(template)).toBeNull();
    }
  });

  it("takes Ruby's `.` for the decimal: any character but a line feed", () => {
    expect(parseStringFormat("#,##0\r###")?.decimal).toBe("\r");
    expect(parseStringFormat("##0\u2028##")?.decimal).toBe("\u2028");
  });

  it("counts characters, not UTF-16 units, and reads one character per separator", () => {
    expect(parseStringFormat("\u{1F600}##0\u{1F601}##\u{1F602}")).toStrictEqual({
      decimal: "\u{1F601}",
      groupDigits: 3,
      fractionGroupDigits: 2,
      group: "\u{1F600}",
      fractionGroup: "\u{1F602}",
    });
  });

  it("leaves an absent separator empty rather than defaulted", () => {
    expect(parseStringFormat("##0.#")).toStrictEqual({
      decimal: ".",
      groupDigits: 3,
      fractionGroupDigits: 1,
      group: "",
      fractionGroup: "",
    });
  });
});

describe("option validation", () => {
  const refuses = (formatter: FormatterOptions) => {
    expect(() => resolveNumberFormat(formatter, "omml")).toThrow(RenderError);
    expect(() => resolveNumberFormat(formatter, "omml")).toThrow(/formatter\.stringFormat/);
  };

  it("refuses a non-string template, as NumberFormatter#validated_localize_number does", () => {
    // Measured: `Standard.new(string_format: 5)` and `string_format: :"#,##0.## #"`
    // both raise ConfigurationError (invalid_formatter_option) on the oracle.
    refuses({ stringFormat: 5 } as never);
    refuses({ stringFormat: true } as never);
    refuses({ stringFormat: ["#,##0.## #"] } as never);
  });

  it("treats null and undefined as no template", () => {
    const plain = resolveNumberFormat({}, "omml");
    expect(resolveNumberFormat({ stringFormat: null }, "omml")).toStrictEqual(plain);
    expect(resolveNumberFormat({ stringFormat: undefined } as never, "omml")).toStrictEqual(plain);
  });
});
