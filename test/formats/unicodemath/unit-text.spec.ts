/**
 * A unit symbol of more than one character is written to UnicodeMath as quoted
 * upright text, `\mup"kg"`, because UnicodeMath reads `\mupkg` back as an
 * upright `k` followed by `g`. One-letter symbols keep the `\mupg` form.
 *
 * Measured on plurimath PR #549 (head 6750dc9c), which adds the rule to
 * `FontStyle::Normal#to_unicodemath` for nodes rendered inside a unit:
 *
 *   Plurimath::Math.parse(input, :asciimath).to_unicodemath
 *     "unitsml(kg)"           \mup"kg"
 *     1 "unitsml(kg)"         1 \mup"kg"
 *     1 "unitsml(mol)"        1 \mup"mol"
 *     1 "unitsml(um)"         1 \mup"µm"
 *     1 "unitsml(degC)"       1 \mup"°C"
 *     1 "unitsml(kg*m^2)"     1 \mup"kg" ⋅ \mupm^(2)
 *     1 "unitsml(m*s^-1)"     1 \mupm ⋅ \mups^(− 1)
 *     1 "unitsml(g)"          1 \mupg
 *     rm(kg)                  \mupk g
 */

import { describe, expect, it } from "vitest";
import { FontStyleNode, FormulaNode, SymbolNode } from "../../../src/core/index";
import { parseAsciimath } from "../../../src/formats/asciimath/index";
import { toUnicodemath } from "../../../src/formats/unicodemath/index";

const MEASURED: readonly (readonly [string, string])[] = [
  ['"unitsml(kg)"', '\\mup"kg"'],
  ['1 "unitsml(kg)"', '1 \\mup"kg"'],
  ['1 "unitsml(mol)"', '1 \\mup"mol"'],
  ['1 "unitsml(um)"', '1 \\mup"µm"'],
  ['1 "unitsml(mm)"', '1 \\mup"mm"'],
  ['1 "unitsml(degC)"', '1 \\mup"°C"'],
  ['1 "unitsml(Hz)"', '1 \\mup"Hz"'],
  ['1 "unitsml(kg*m^2)"', '1 \\mup"kg" ⋅ \\mupm^(2)'],
  ['1 "unitsml(m*s^-1)"', "1 \\mupm ⋅ \\mups^(− 1)"],
  ['1 "unitsml(g)"', "1 \\mupg"],
  ['1 "unitsml(m)"', "1 \\mupm"],
  ['1 "unitsml(K)"', "1 \\mupK"],
  ["rm(kg)", "\\mupk g"],
];

describe("UnicodeMath unit symbols", () => {
  for (const [input, expected] of MEASURED) {
    it(`writes ${input} as ${expected}`, () => {
      expect(toUnicodemath(parseAsciimath(input))).toBe(expected);
    });
  }

  it("keeps a multi-letter upright symbol outside a unit unchanged", () => {
    const formula = new FormulaNode({
      value: [new FontStyleNode({ name: "Normal", parameterOne: new SymbolNode({ value: "kg" }) })],
    });
    expect(toUnicodemath(formula)).toBe("\\mupkg");
  });
});
