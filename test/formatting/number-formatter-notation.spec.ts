/**
 * B2's notation slice: `notation` (`e`, `scientific`, `engineering`) with
 * `e`, `times` and `exponentSign` of the per-call `formatter:` option.
 *
 * The pinned `calls/1` cases that use a notation (`number-formatting-notation`
 * and the `sign-plus-*` notation cases) run for every target in
 * `number-formatter-numeric-pipeline.spec.ts`. This file holds what is
 * measured directly on the oracle, a case per row: every notation crossed with
 * precision, significant, digit_count, sign, grouping, zero, very small and
 * very large exponents and custom symbols; the MathML/HTML/UnicodeMath layout;
 * and the option validation.
 *
 * Every text below answers `localized_number` of
 * `Formatter::Standard.new(locale: "en", options: OPTIONS, precision: PRECISION)`
 * on the pinned oracle (`~/ruby_gems/plurimath-oracle` at 00c52783, v0.11.6):
 *
 *   BUNDLE_GEMFILE=~/ruby_gems/plurimath-oracle/Gemfile mise x -- bundle exec ruby \
 *     -I ~/ruby_gems/plurimath-oracle/lib -e '
 *       require "plurimath"
 *       puts Plurimath::Formatter::Standard.new(locale: "en", options: OPTIONS, precision: PRECISION)
 *                                          .localized_number(VALUE)'
 *
 * Several inputs come from `spec/plurimath/number_formatter_spec.rb`'s notation,
 * significant, digit_count and number_sign contexts, rerun through `Standard`
 * (whose defaults — fraction grouping on, `times: "x"` — differ from the base
 * `NumberFormatter` those examples use), so the strings are what `Standard`
 * answered. OMML is not wired to the formatter in this tree, so it is covered
 * through the shared formatting function only (the plain text every
 * non-MathML target renders; the corpus pins OMML to that same text inside
 * `<m:t>`).
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../src/core/errors";
import type { ConstructedMathNode } from "../../src/core/nodes";
import { toAsciimath } from "../../src/formats/asciimath/index";
import { toHtml } from "../../src/formats/html/index";
import { toLatex } from "../../src/formats/latex/index";
import { toMathml } from "../../src/formats/mathml/index";
import { toUnicodemath } from "../../src/formats/unicodemath/index";
import {
  applyNumberFormat,
  type FormatterOptions,
  resolveNumberFormat,
} from "../../src/formatting/index";
import { aliasIndex, buildNode, readCensus, type SerializedNode } from "../core/model-builder";

/** `[value, formatter, expected]`. */
const MEASURED: ReadonlyArray<readonly [string, FormatterOptions, string]> = [
  ["1234.5", { options: { notation: "e" } }, "1.234'5e3"],
  ["1234.5", { precision: 0, options: { notation: "e" } }, "1e3"],
  ["1234.5", { precision: 2, options: { notation: "e" } }, "1.23e3"],
  ["1234.5", { precision: 8, options: { notation: "e" } }, "1.234'500'00e3"],
  ["0.00123", { options: { notation: "e" } }, "1.23e-3"],
  ["0.00123", { precision: 1, options: { notation: "e" } }, "1.2e-3"],
  ["-0.00123", { options: { notation: "e" } }, "-1.23e-3"],
  ["123456789", { options: { notation: "e" } }, "1.234'567'89e8"],
  ["123456789", { options: { notation: "e", significant: 3 } }, "1.23e8"],
  ["123456789", { options: { notation: "e", significant: 12 } }, "1.234'567'890'00e8"],
  ["123456789", { options: { notation: "e", digitCount: 4 } }, "1.235e8"],
  ["123456789", { options: { notation: "e", digitCount: 12 } }, "1.234'567'890'00e8"],
  ["9.999", { options: { notation: "e", significant: 2 } }, "10e0"],
  ["9.999", { options: { notation: "e", digitCount: 2 } }, "10e0"],
  ["999999", { options: { notation: "e", significant: 2 } }, "10e5"],
  ["0", { options: { notation: "e" } }, "0e0"],
  ["0", { precision: 2, options: { notation: "e" } }, "0.00e0"],
  ["0.000", { options: { notation: "e" } }, "0.000e0"],
  ["-0", { options: { notation: "e" } }, "-0e0"],
  ["0", { options: { notation: "e", numberSign: "plus" } }, "+0e0"],
  ["5", { options: { notation: "e", numberSign: "plus" } }, "+5e0"],
  ["-5", { options: { notation: "e", numberSign: "plus" } }, "-5e0"],
  ["1e400", { options: { notation: "e" } }, "1e400"],
  ["1e-400", { options: { notation: "e" } }, "1e-400"],
  ["1.5e-7", { options: { notation: "e" } }, "1.5e-7"],
  ["12e5", { options: { notation: "e", exponentSign: "plus" } }, "1.2e+6"],
  ["0.5", { options: { notation: "e", exponentSign: "plus" } }, "5e-1"],
  [
    "1234567.891234",
    { options: { notation: "e", group: " ", fractionGroup: "_", fractionGroupDigits: 2 } },
    "1.23_45_67_89_12_34e6",
  ],
  [
    "1234567.891234",
    { options: { notation: "e", decimal: ",", fractionGroup: "", fractionGroupDigits: 0 } },
    "1,234567891234e6",
  ],
  ["100", { options: { notation: "e" } }, "1.00e2"],
  ["100", { precision: 3, options: { notation: "e" } }, "1.000e2"],
  ["1000000", { precision: 5, options: { notation: "e", fractionGroupDigits: 2 } }, "1.00'00'0e6"],
  ["0.0001", { options: { notation: "e", significant: 4 } }, "1.000e-4"],
  ["20", { options: { notation: "e", significant: 1 } }, "2e1"],
  ["25", { options: { notation: "e", significant: 1 } }, "3e1"],
  ["1234.5", { options: { notation: "e", times: "*", e: "E" } }, "1.234'5E3"],
  [
    "1234.5",
    { options: { notation: "e", times: "\u00b7", e: "E", exponentSign: "plus" } },
    "1.234'5E+3",
  ],
  ["1234.5", { options: { notation: "e", e: "" } }, "1.234'53"],
  ["1234.5", { options: { notation: "e", times: null } }, "1.234'5e3"],
  ["1234.5", { options: { notation: "e", e: null } }, "1.234'5e3"],
  ["1234.5", { options: { notation: "e", exponentSign: "minus" } }, "1.234'5e3"],
  ["0.5", { options: { notation: "e", paddingDigits: 6 } }, "000,005e-1"],
  ["7", { options: { notation: "e", precision: 3 } }, "7.000e0"],
  ["-1234.5", { options: { notation: "e", precision: 1, numberSign: "plus" } }, "-1.2e3"],
  ["1e5", { precision: 3, options: { notation: "e", significant: 2 } }, "1.0e5"],
  ["12345678.9", { options: { notation: "e", digitCount: 5, significant: 3 } }, "1.23e7"],
  ["0.999", { options: { notation: "e", digitCount: 2 } }, "10e-1"],
  ["1000", { precision: 0, options: { notation: "e", significant: 2 } }, "1e3"],
  ["1234.5", { options: { notation: "scientific" } }, "1.234'5 x 10^3"],
  ["1234.5", { precision: 0, options: { notation: "scientific" } }, "1 x 10^3"],
  ["1234.5", { precision: 2, options: { notation: "scientific" } }, "1.23 x 10^3"],
  ["1234.5", { precision: 8, options: { notation: "scientific" } }, "1.234'500'00 x 10^3"],
  ["0.00123", { options: { notation: "scientific" } }, "1.23 x 10^-3"],
  ["0.00123", { precision: 1, options: { notation: "scientific" } }, "1.2 x 10^-3"],
  ["-0.00123", { options: { notation: "scientific" } }, "-1.23 x 10^-3"],
  ["123456789", { options: { notation: "scientific" } }, "1.234'567'89 x 10^8"],
  ["123456789", { options: { notation: "scientific", significant: 3 } }, "1.23 x 10^8"],
  [
    "123456789",
    { options: { notation: "scientific", significant: 12 } },
    "1.234'567'890'00 x 10^8",
  ],
  ["123456789", { options: { notation: "scientific", digitCount: 4 } }, "1.235 x 10^8"],
  ["123456789", { options: { notation: "scientific", digitCount: 12 } }, "1.234'567'890'00 x 10^8"],
  ["9.999", { options: { notation: "scientific", significant: 2 } }, "10 x 10^0"],
  ["9.999", { options: { notation: "scientific", digitCount: 2 } }, "10 x 10^0"],
  ["999999", { options: { notation: "scientific", significant: 2 } }, "10 x 10^5"],
  ["0", { options: { notation: "scientific" } }, "0 x 10^0"],
  ["0", { precision: 2, options: { notation: "scientific" } }, "0.00 x 10^0"],
  ["0.000", { options: { notation: "scientific" } }, "0.000 x 10^0"],
  ["-0", { options: { notation: "scientific" } }, "-0 x 10^0"],
  ["0", { options: { notation: "scientific", numberSign: "plus" } }, "+0 x 10^0"],
  ["5", { options: { notation: "scientific", numberSign: "plus" } }, "+5 x 10^0"],
  ["-5", { options: { notation: "scientific", numberSign: "plus" } }, "-5 x 10^0"],
  ["1e400", { options: { notation: "scientific" } }, "1 x 10^400"],
  ["1e-400", { options: { notation: "scientific" } }, "1 x 10^-400"],
  ["1.5e-7", { options: { notation: "scientific" } }, "1.5 x 10^-7"],
  ["12e5", { options: { notation: "scientific", exponentSign: "plus" } }, "1.2 x 10^+6"],
  ["0.5", { options: { notation: "scientific", exponentSign: "plus" } }, "5 x 10^-1"],
  [
    "1234567.891234",
    { options: { notation: "scientific", group: " ", fractionGroup: "_", fractionGroupDigits: 2 } },
    "1.23_45_67_89_12_34 x 10^6",
  ],
  [
    "1234567.891234",
    {
      options: { notation: "scientific", decimal: ",", fractionGroup: "", fractionGroupDigits: 0 },
    },
    "1,234567891234 x 10^6",
  ],
  ["100", { options: { notation: "scientific" } }, "1.00 x 10^2"],
  ["100", { precision: 3, options: { notation: "scientific" } }, "1.000 x 10^2"],
  [
    "1000000",
    { precision: 5, options: { notation: "scientific", fractionGroupDigits: 2 } },
    "1.00'00'0 x 10^6",
  ],
  ["0.0001", { options: { notation: "scientific", significant: 4 } }, "1.000 x 10^-4"],
  ["20", { options: { notation: "scientific", significant: 1 } }, "2 x 10^1"],
  ["25", { options: { notation: "scientific", significant: 1 } }, "3 x 10^1"],
  ["1234.5", { options: { notation: "scientific", times: "*", e: "E" } }, "1.234'5 * 10^3"],
  [
    "1234.5",
    { options: { notation: "scientific", times: "\u00b7", e: "E", exponentSign: "plus" } },
    "1.234'5 \u00b7 10^+3",
  ],
  ["1234.5", { options: { notation: "scientific", e: "" } }, "1.234'5 x 10^3"],
  ["1234.5", { options: { notation: "scientific", times: null } }, "1.234'5 \u00d7 10^3"],
  ["1234.5", { options: { notation: "scientific", e: null } }, "1.234'5 x 10^3"],
  ["1234.5", { options: { notation: "scientific", exponentSign: "minus" } }, "1.234'5 x 10^3"],
  ["0.5", { options: { notation: "scientific", paddingDigits: 6 } }, "000,005 x 10^-1"],
  ["7", { options: { notation: "scientific", precision: 3 } }, "7.000 x 10^0"],
  [
    "-1234.5",
    { options: { notation: "scientific", precision: 1, numberSign: "plus" } },
    "-1.2 x 10^3",
  ],
  ["1e5", { precision: 3, options: { notation: "scientific", significant: 2 } }, "1.0 x 10^5"],
  [
    "12345678.9",
    { options: { notation: "scientific", digitCount: 5, significant: 3 } },
    "1.23 x 10^7",
  ],
  ["0.999", { options: { notation: "scientific", digitCount: 2 } }, "10 x 10^-1"],
  ["1000", { precision: 0, options: { notation: "scientific", significant: 2 } }, "1 x 10^3"],
  ["1234.5", { options: { notation: "engineering" } }, "1.234'5 x 10^3"],
  ["1234.5", { precision: 0, options: { notation: "engineering" } }, "1.234'5 x 10^3"],
  ["1234.5", { precision: 2, options: { notation: "engineering" } }, "1.23 x 10^3"],
  ["1234.5", { precision: 8, options: { notation: "engineering" } }, "1.234'500'00 x 10^3"],
  ["0.00123", { options: { notation: "engineering" } }, "1.23 x 10^-3"],
  ["0.00123", { precision: 1, options: { notation: "engineering" } }, "1.2 x 10^-3"],
  ["-0.00123", { options: { notation: "engineering" } }, "-1.23 x 10^-3"],
  ["123456789", { options: { notation: "engineering" } }, "123.456'789 x 10^6"],
  ["123456789", { options: { notation: "engineering", significant: 3 } }, "123 x 10^6"],
  [
    "123456789",
    { options: { notation: "engineering", significant: 12 } },
    "123.456'789'000 x 10^6",
  ],
  ["123456789", { options: { notation: "engineering", digitCount: 4 } }, "123.5 x 10^6"],
  ["123456789", { options: { notation: "engineering", digitCount: 12 } }, "123.456'789'000 x 10^6"],
  ["9.999", { options: { notation: "engineering", significant: 2 } }, "10 x 10^0"],
  ["9.999", { options: { notation: "engineering", digitCount: 2 } }, "10 x 10^0"],
  ["999999", { options: { notation: "engineering", significant: 2 } }, "1,000 x 10^3"],
  ["0", { options: { notation: "engineering" } }, "0 x 10^0"],
  ["0", { precision: 2, options: { notation: "engineering" } }, "0.00 x 10^0"],
  ["0.000", { options: { notation: "engineering" } }, "0.000 x 10^0"],
  ["-0", { options: { notation: "engineering" } }, "-0 x 10^0"],
  ["0", { options: { notation: "engineering", numberSign: "plus" } }, "+0 x 10^0"],
  ["5", { options: { notation: "engineering", numberSign: "plus" } }, "+5 x 10^0"],
  ["-5", { options: { notation: "engineering", numberSign: "plus" } }, "-5 x 10^0"],
  ["1e400", { options: { notation: "engineering" } }, "10 x 10^399"],
  ["1e-400", { options: { notation: "engineering" } }, "100 x 10^-402"],
  ["1.5e-7", { options: { notation: "engineering" } }, "150 x 10^-9"],
  ["12e5", { options: { notation: "engineering", exponentSign: "plus" } }, "1.2 x 10^+6"],
  ["0.5", { options: { notation: "engineering", exponentSign: "plus" } }, "500 x 10^-3"],
  [
    "1234567.891234",
    {
      options: { notation: "engineering", group: " ", fractionGroup: "_", fractionGroupDigits: 2 },
    },
    "1.23_45_67_89_12_34 x 10^6",
  ],
  [
    "1234567.891234",
    {
      options: { notation: "engineering", decimal: ",", fractionGroup: "", fractionGroupDigits: 0 },
    },
    "1,234567891234 x 10^6",
  ],
  ["100", { options: { notation: "engineering" } }, "100 x 10^0"],
  ["100", { precision: 3, options: { notation: "engineering" } }, "100.000 x 10^0"],
  [
    "1000000",
    { precision: 5, options: { notation: "engineering", fractionGroupDigits: 2 } },
    "1.00'00'0 x 10^6",
  ],
  ["0.0001", { options: { notation: "engineering", significant: 4 } }, "100.0 x 10^-6"],
  ["20", { options: { notation: "engineering", significant: 1 } }, "20 x 10^0"],
  ["25", { options: { notation: "engineering", significant: 1 } }, "30 x 10^0"],
  ["1234.5", { options: { notation: "engineering", times: "*", e: "E" } }, "1.234'5 * 10^3"],
  [
    "1234.5",
    { options: { notation: "engineering", times: "\u00b7", e: "E", exponentSign: "plus" } },
    "1.234'5 \u00b7 10^+3",
  ],
  ["1234.5", { options: { notation: "engineering", e: "" } }, "1.234'5 x 10^3"],
  ["1234.5", { options: { notation: "engineering", times: null } }, "1.234'5 \u00d7 10^3"],
  ["1234.5", { options: { notation: "engineering", e: null } }, "1.234'5 x 10^3"],
  ["1234.5", { options: { notation: "engineering", exponentSign: "minus" } }, "1.234'5 x 10^3"],
  ["0.5", { options: { notation: "engineering", paddingDigits: 6 } }, "000,500 x 10^-3"],
  ["7", { options: { notation: "engineering", precision: 3 } }, "7.000 x 10^0"],
  [
    "-1234.5",
    { options: { notation: "engineering", precision: 1, numberSign: "plus" } },
    "-1.2 x 10^3",
  ],
  ["1e5", { precision: 3, options: { notation: "engineering", significant: 2 } }, "100 x 10^3"],
  [
    "12345678.9",
    { options: { notation: "engineering", digitCount: 5, significant: 3 } },
    "12.3 x 10^6",
  ],
  ["0.999", { options: { notation: "engineering", digitCount: 2 } }, "999 x 10^-3"],
  ["1000", { precision: 0, options: { notation: "engineering", significant: 2 } }, "1.0 x 10^3"],
];

describe("notation, measured on the oracle", () => {
  it("has more than 60 rows, each notation appearing in equal number", () => {
    // 144 is the count of rows generated, three notations at 48 each.
    expect(MEASURED).toHaveLength(144);
    for (const notation of ["e", "scientific", "engineering"]) {
      expect(MEASURED.filter((row) => row[1].options?.notation === notation)).toHaveLength(48);
    }
  });

  it.each(MEASURED)("%s with %j", (value, formatter, expected) => {
    const format = resolveNumberFormat(formatter, "asciimath");
    if (format === null) throw new Error("expected an active formatter");
    expect(applyNumberFormat(value, format)).toBe(expected);
  });
});

function formulaOf(value: string): ConstructedMathNode {
  // The serialized shape the corpus stores (snake_case field names), as JSON text.
  const model = `{"class":"Math::Formula","fields":{"displaystyle":true,"input_string":${JSON.stringify(
    value,
  )},"left_right_wrapper":true,"value":[{"class":"Math::Number","fields":{"base":null,"mini_sub_sized":false,"mini_sup_sized":false,"value":${JSON.stringify(
    value,
  )}}}]}}`;
  return buildNode(JSON.parse(model) as SerializedNode, aliasIndex(readCensus()));
}

/** `[value, options, mathml, text]` — `Formula#to_mathml` / `to_html` on the oracle. */
const LAYOUT: ReadonlyArray<
  readonly [string, NonNullable<FormatterOptions["options"]>, string, string]
> = [
  [
    "1234.5",
    { notation: "scientific" },
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mstyle displaystyle="true">\n    <mrow>\n      <mn>1.234\'5</mn>\n      <mo>x</mo>\n      <msup>\n        <mn>10</mn>\n        <mn>3</mn>\n      </msup>\n    </mrow>\n  </mstyle>\n</math>\n',
    "1.234'5 x 10^3",
  ],
  [
    "-0.00123",
    { notation: "engineering", numberSign: "plus", times: null },
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mstyle displaystyle="true">\n    <mrow>\n      <mn>-1.23</mn>\n      <mo>\u00d7</mo>\n      <msup>\n        <mn>10</mn>\n        <mn>-3</mn>\n      </msup>\n    </mrow>\n  </mstyle>\n</math>\n',
    "-1.23 \u00d7 10^-3",
  ],
  [
    "-0.00123",
    { notation: "scientific", exponentSign: "plus", times: "<" },
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mstyle displaystyle="true">\n    <mrow>\n      <mn>-1.23</mn>\n      <mo>&lt;</mo>\n      <msup>\n        <mn>10</mn>\n        <mn>-3</mn>\n      </msup>\n    </mrow>\n  </mstyle>\n</math>\n',
    "-1.23 < 10^-3",
  ],
  [
    "1234.5",
    { notation: "e", e: "&" },
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mstyle displaystyle="true">\n    <mn>1.234\'5&3</mn>\n  </mstyle>\n</math>\n',
    "1.234'5&3",
  ],
  [
    "5",
    { notation: "engineering", exponentSign: "plus" },
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">\n  <mstyle displaystyle="true">\n    <mrow>\n      <mn>5</mn>\n      <mo>x</mo>\n      <msup>\n        <mn>10</mn>\n        <mn>0</mn>\n      </msup>\n    </mrow>\n  </mstyle>\n</math>\n',
    "5 x 10^0",
  ],
];

describe("how each target lays a notation out", () => {
  it.each(LAYOUT)("%s with %j", (value, options, mathml, text) => {
    const formatter: FormatterOptions = { options };
    expect(toMathml(formulaOf(value), { formatter })).toBe(mathml);
    for (const render of [toAsciimath, toLatex, toHtml, toUnicodemath]) {
      expect(render(formulaOf(value), { formatter })).toBe(text);
    }
  });
});

describe("option validation", () => {
  const refuses = (options: Record<string, unknown>, pattern: RegExp) => {
    const formatter = { options } as FormatterOptions;
    expect(() => resolveNumberFormat(formatter, "asciimath")).toThrow(RenderError);
    expect(() => resolveNumberFormat(formatter, "asciimath")).toThrow(pattern);
  };

  it("refuses a non-string notation, e, times and exponentSign (the gem's invalid_formatter_option)", () => {
    for (const key of ["notation", "e", "times", "exponentSign"]) {
      refuses({ [key]: 5 }, new RegExp(key));
      refuses({ [key]: true }, new RegExp(key));
    }
  });

  it("renders an unknown or differently cased notation as a plain number, as the gem does", () => {
    // Measured: notation "foo", "Scientific" and "basic" all answer "1,234.5" for 1234.5.
    for (const notation of ["foo", "Scientific", "basic", null]) {
      const format = resolveNumberFormat({ options: { notation } }, "asciimath");
      if (format === null) throw new Error("expected an active formatter");
      expect(applyNumberFormat("1234.5", format)).toBe("1,234.5");
    }
  });
});
