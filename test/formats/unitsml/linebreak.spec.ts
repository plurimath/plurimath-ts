import { describe, expect, it } from "vitest";
import { FormulaNode, LinebreakNode, normalize, UnitsmlNode } from "../../../src/core/index";
import { toMathml } from "../../../src/formats/mathml/index";
import { toOmml } from "../../../src/formats/omml/index";

const unit = (text: string) => new FormulaNode({ value: [new UnitsmlNode({ text })] });
const twoLines = () =>
  new FormulaNode({
    value: [new UnitsmlNode({ text: "m*s" }), new LinebreakNode(), new UnitsmlNode({ text: "kg" })],
  });

describe("UnitsML in the pinned linebreak clone path", () => {
  it.each([
    ["mathml", toMathml],
    ["omml", toOmml],
  ] as const)(
    "%s split without a linebreak preserves its default render and input",
    (_format, render) => {
      const formula = unit("kg");
      const before = normalize(formula);
      expect(render(formula, { splitOnLinebreak: true })).toBe(render(formula));
      expect(normalize(formula)).toStrictEqual(before);
    },
  );

  it("MathML splits actual lines using each line's default UnitsML render", () => {
    const formula = twoLines();
    const before = normalize(formula);
    expect(toMathml(formula, { splitOnLinebreak: true })).toBe(
      toMathml(unit("m*s")) + toMathml(unit("kg")),
    );
    expect(normalize(formula)).toStrictEqual(before);
  });

  it("OMML keeps UnitsML options when rendering each split line", () => {
    const unitsml = { multiplier: Symbol.for("space") };
    expect(toOmml(unit("m*s"), { splitOnLinebreak: true, unitsml })).toBe(
      toOmml(unit("m*s"), { unitsml }),
    );
    // OMML keeps one paragraph and inserts a break run between its lines;
    // compare the option effect rather than concatenating full documents.
    expect(toOmml(twoLines(), { splitOnLinebreak: true, unitsml })).not.toBe(
      toOmml(twoLines(), { splitOnLinebreak: true }),
    );
  });

  it("MathML split drops UnitsML metadata options even without an actual break", () => {
    const formula = unit("kg");
    expect(toMathml(formula, { unitsml: { xml: true } })).not.toBe(toMathml(formula));
    expect(toMathml(formula, { splitOnLinebreak: true, unitsml: { xml: true } })).toBe(
      toMathml(formula),
    );
    expect(toMathml(twoLines(), { splitOnLinebreak: true, unitsml: { xml: true } })).toBe(
      toMathml(unit("m*s")) + toMathml(unit("kg")),
    );
  });
});
