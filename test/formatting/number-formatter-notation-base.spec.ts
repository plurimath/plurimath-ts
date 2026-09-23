/**
 * B2's notation x base interaction: `notation` (`e`/`scientific`/`engineering`)
 * together with `base` 2/8/16, `basePrefix`/`basePostfix` and `hexCapital`.
 * The rows are measured on the oracle (`number-formatter-notation-base-cases.ts`,
 * command in its header) and rendered through a whole formula for asciimath,
 * latex, html, unicodemath and mathml.
 *
 * The gem checks precision in the order explicit, base, notation
 * (`PrecisionResolver#resolve`); the `significant` rows here exercise the base
 * rule running ahead of the notation rule.
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../src/core/errors";
import { FormulaNode, NumberNode } from "../../src/core/nodes";
import { toAsciimath } from "../../src/formats/asciimath/index";
import { toHtml } from "../../src/formats/html/index";
import { toLatex } from "../../src/formats/latex/index";
import { toMathml } from "../../src/formats/mathml/index";
import { toUnicodemath } from "../../src/formats/unicodemath/index";
import { resolveNumberFormat } from "../../src/formatting/index";
import {
  NOTATION_BASE_MEASURED,
  NOTATION_BASE_REFUSED,
} from "./number-formatter-notation-base-cases";

function formula(value: string): FormulaNode {
  return new FormulaNode({ value: [new NumberNode({ value })] });
}

/** The inside of `<mstyle displaystyle="true">`, whitespace between tags removed. */
function mathmlInside(mathml: string): string {
  const match = /<mstyle displaystyle="true">(.*)<\/mstyle>/s.exec(mathml.replace(/>\s+</g, "><"));
  if (match === null) throw new Error(`no mstyle in ${mathml}`);
  return match[1] as string;
}

describe("measured notation x base cases", () => {
  it("has 15 or more cases", () => {
    // The length of the generated table.
    expect(NOTATION_BASE_MEASURED.length).toBeGreaterThanOrEqual(15);
    expect(NOTATION_BASE_REFUSED.length).toBeGreaterThan(0);
  });

  it.each(NOTATION_BASE_MEASURED.map((row) => [row[0], JSON.stringify(row[1]), row] as const))(
    "%s with %s renders like the oracle in every target",
    (_value, _formatter, [value, formatter, text, mathml]) => {
      const node = formula(value);
      expect(toAsciimath(node, { formatter })).toBe(text);
      expect(toLatex(node, { formatter })).toBe(text);
      expect(toHtml(node, { formatter })).toBe(text);
      expect(toUnicodemath(node, { formatter })).toBe(text);
      expect(mathmlInside(toMathml(node, { formatter }))).toBe(mathml);
    },
  );

  it.each(NOTATION_BASE_REFUSED.map((row) => [JSON.stringify(row[0]), row] as const))(
    "refuses %s as a RenderError, where the gem raises",
    (_label, [formatter]) => {
      expect(() => toAsciimath(formula("255"), { formatter } as never)).toThrow(RenderError);
    },
  );

  it("takes an unsupported notation as a plain number, the base then drawing its semantic form", () => {
    // Measured: `notation: "foo", base: 16` on 255 answers `ff_(16)` in asciimath.
    const formatter = { options: { notation: "foo", base: 16 as const } };
    expect(toAsciimath(formula("255"), { formatter })).toBe("ff_(16)");
    expect(toLatex(formula("255"), { formatter })).toBe("\\mathrm{ff}_{16}");
    expect(toHtml(formula("255"), { formatter })).toBe("ff<sub>16</sub>");
  });

  it("accepts every notation key and every base key together", () => {
    expect(() =>
      resolveNumberFormat(
        {
          options: {
            notation: "e",
            e: "E",
            times: "*",
            exponentSign: "plus",
            base: 16,
            basePrefix: "#",
            basePostfix: "h",
            hexCapital: true,
          },
        },
        "latex",
      ),
    ).not.toThrow();
  });
});
