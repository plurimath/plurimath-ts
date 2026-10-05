/**
 * B2's base-notation slice: `base` (2, 8, 10, 16), `basePrefix`,
 * `basePostfix` and `hexCapital` of the per-call `formatter:` option.
 *
 * The 19 pinned `calls/1` base cases are exercised by
 * `number-formatter-numeric-pipeline.spec.ts` (every in-scope case renders
 * byte-identically for asciimath, latex, mathml, unicodemath and html); this
 * spec adds the cases measured directly on the oracle
 * (`number-formatter-base-notation-cases.ts`, command in its header) — bases
 * x prefix/postfix x hex capitalization x sign x fraction x precision x
 * significant x digit_count x padding x zero x large values — rendered through
 * a whole formula for every target, plus the option validation.
 *
 * OMML is covered here through the shared function and its insert-path text
 * (below); its two render paths are `number-formatter-omml.spec.ts`'s.
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
import {
  applyNumberFormat,
  type FormatterOptions,
  formatNumberForMathml,
  resolveNumberFormat,
} from "../../src/formatting/index";
import { MEASURED, type PerTarget, REFUSED_OPTIONS } from "./number-formatter-base-notation-cases";

function formula(value: string): FormulaNode {
  return new FormulaNode({ value: [new NumberNode({ value })] });
}

/** `Formula#to_mathml`'s output with the whitespace between tags removed. */
function compact(mathml: string): string {
  return mathml.replace(/>\s+</g, "><");
}

/** The inside of `<mstyle displaystyle="true">`, as the cases file records it. */
function mathmlInside(mathml: string): string {
  const match = /<mstyle displaystyle="true">(.*)<\/mstyle>/s.exec(compact(mathml));
  if (match === null) throw new Error(`no mstyle in ${mathml}`);
  return match[1] as string;
}

function expectedFor(expected: string | PerTarget): PerTarget {
  if (typeof expected !== "string") return expected;
  return {
    asciimath: expected,
    latex: expected,
    html: expected,
    unicodemath: expected,
    mathml: `<mn>${expected}</mn>`,
  };
}

describe("measured base-notation cases", () => {
  it("has 60 or more cases, and the semantic and the literal forms are both among them", () => {
    // Counts are measured: this is the length of the generated table.
    expect(MEASURED.length).toBeGreaterThanOrEqual(60);
    expect(MEASURED.some(([, , e]) => typeof e !== "string")).toBe(true);
    expect(MEASURED.some(([, , e]) => typeof e === "string")).toBe(true);
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
      expect(mathmlInside(toMathml(node, { formatter }))).toBe(want.mathml);
    },
  );
});

describe("the shared function (what OMML reads)", () => {
  const format = (formatter: FormatterOptions) => {
    const resolved = resolveNumberFormat(formatter, "omml");
    if (resolved === null) throw new Error("expected an active formatter");
    return resolved;
  };

  it("answers the flat text (`FormattedNumber#to_s`) with the literal affixes and no template", () => {
    expect(applyNumberFormat("255", format({ options: { base: 16 } }))).toBe("0xff");
    expect(applyNumberFormat("-255", format({ options: { base: 2, basePrefix: "#" } }))).toBe(
      "-#11,111,111",
    );
    expect(applyNumberFormat("255", format({ options: { base: 16, basePostfix: "h" } }))).toBe(
      "ffh",
    );
    expect(applyNumberFormat("255", format({ options: { base: 10, basePrefix: "P" } }))).toBe(
      "255",
    );
  });

  it("gives the semantic parts MathML draws as a subscript", () => {
    expect(formatNumberForMathml("-255", format({ options: { base: 16 } }))).toStrictEqual({
      kind: "base",
      sign: "-",
      digits: "ff",
      base: 16,
    });
    expect(
      formatNumberForMathml("255", format({ options: { base: 16, basePrefix: "" } })),
    ).toStrictEqual({ kind: "plain", text: "ff" });
  });

  it("is what OMML's insert path writes: the prefixed text, not a subscript", () => {
    // Measured, oracle 00c52783: `Formula.new([Number.new("255")]).to_omml(formatter:
    // Standard.new(options: { base: 16 }))` writes `<m:t>0xff</m:t>`.
    expect(toOmml(formula("255"), { formatter: { options: { base: 16 } } })).toContain(
      "<m:t>0xff</m:t>",
    );
  });
});

describe("option validation", () => {
  it.each(REFUSED_OPTIONS.map((row) => [JSON.stringify(row[0]), row] as const))(
    "refuses %s as a RenderError, where the gem raises at render time",
    (_label, [formatter, gemError]) => {
      // The gem's error class is the cause the case file measured; it is a
      // render failure, so the port's refusal is never a parse error.
      expect(gemError).toMatch(/UnsupportedBase|ConfigurationError/);
      expect(() => toAsciimath(formula("255"), { formatter } as never)).toThrow(RenderError);
      expect(() => resolveNumberFormat(formatter as FormatterOptions, "latex")).toThrow(
        /formatter\.options\.(base|hexCapital|basePrefix|basePostfix)/,
      );
    },
  );

  it("names the unsupported base and the gem error", () => {
    expect(() => resolveNumberFormat({ options: { base: 3 } }, "latex")).toThrow(
      /formatter\.options\.base: 3 is not one of 2, 8, 10, 16 .*UnsupportedBase/,
    );
  });

  it("refuses a numeric string base, where the gem coerces it (this port's options are typed)", () => {
    expect(() => resolveNumberFormat({ options: { base: "16" as never } }, "latex")).toThrow(
      /formatter\.options\.base/,
    );
  });

  it("refuses a non-string prefix or postfix, where the gem accepts and stringifies it", () => {
    expect(() => resolveNumberFormat({ options: { basePrefix: 5 as never } }, "latex")).toThrow(
      /formatter\.options\.basePrefix/,
    );
    expect(() => resolveNumberFormat({ options: { basePostfix: 5 as never } }, "latex")).toThrow(
      /formatter\.options\.basePostfix/,
    );
  });

  it("accepts null and absent base, hex capital and affixes as the gem's nil", () => {
    for (const options of [
      {},
      { base: null },
      { hexCapital: null },
      { base: 16, hexCapital: null },
    ]) {
      expect(() => resolveNumberFormat({ options }, "latex")).not.toThrow();
    }
  });
});
