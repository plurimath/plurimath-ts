// plurimath#477: MathML output no longer carries <mstyle>. displaystyle sits
// on <math>, font and colour wrappers are <mrow mathvariant/mathcolor>, and
// the reader maps those mrow shapes back onto the same nodes (mstyle input is
// still read). Expected bytes were probed from the Ruby gem branch
// fix/477-no-mstyle (commits 5956d25a, 0f466480); they are not hand-written.
import { describe, expect, it } from "vitest";
import Plurimath from "../../../src/compat/index";

const CASES: ReadonlyArray<readonly [string, string, string]> = [
  [
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block" displaystyle="false"><mrow mathvariant="bold"><mi>x</mi></mrow><mrow mathcolor="red"><mi>y</mi><mn>2</mn></mrow></math>',
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block" displaystyle="false">\n  <mrow mathvariant="bold">\n    <mi>x</mi>\n  </mrow>\n  <mrow mathcolor="red">\n    <mrow>\n      <mi>y</mi>\n      <mn>2</mn>\n    </mrow>\n  </mrow>\n</math>\n',
    'mathbf(x) color("red")(y 2)',
  ],
  [
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline" displaystyle="true"><mi>x</mi></math>',
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block" displaystyle="true">\n  <mi>x</mi>\n</math>\n',
    "x",
  ],
  [
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><mstyle displaystyle="false"><mi>x</mi></mstyle></math>',
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block" displaystyle="false">\n  <mi>x</mi>\n</math>\n',
    "x",
  ],
  [
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow mathvariant="bold" mathcolor="blue"><mi>x</mi><mi>z</mi></mrow></math>',
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block" displaystyle="true">\n  <mrow mathvariant="bold">\n    <mrow mathcolor="blue">\n      <mrow>\n        <mi>x</mi>\n        <mi>z</mi>\n      </mrow>\n    </mrow>\n  </mrow>\n</math>\n',
    'mathbf(color("blue")(x z))',
  ],
  [
    '<math xmlns="http://www.w3.org/1998/Math/MathML"><mrow displaystyle="true"><mi>x</mi></mrow></math>',
    '<math xmlns="http://www.w3.org/1998/Math/MathML" display="block" displaystyle="true">\n  <mi>x</mi>\n</math>\n',
    "x",
  ],
];

describe("MathML reader without mstyle (plurimath#477)", () => {
  for (const [input, mathml, asciimath] of CASES) {
    it(`reads ${input}`, () => {
      const formula = new Plurimath(input, "mathml");
      expect(formula.toMathml()).toBe(mathml);
      expect(formula.toAsciimath()).toBe(asciimath);
    });
  }
});
