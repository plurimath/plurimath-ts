/**
 * The two output fixes plurimath-testsuite regenerated after the 0.11.12 pin,
 * measured on plurimath 2967dcc4 (the bytes are unchanged since ed048ee2,
 * which the testsuite rows record):
 *
 *   - #31 / plurimath#508: `Right#to_html` takes the keyword arguments
 *     `Formula#to_html` passes, so the nine left/right inputs render to HTML
 *     (they raised before, and sat in the partial-render group);
 *   - #30 / plurimath#505: `Intent` writes only its content to OMML and HTML,
 *     no longer a nested run and a visible copy of the intent string
 *     (row `mathml-tokens-008`).
 *
 * The rows join the corpus conformance suites when the testsuite pin moves;
 * until then this spec holds the measured bytes.
 */

import { describe, expect, it } from "vitest";
import type { MathNode } from "../../src/core/nodes";
import { parseAsciimath } from "../../src/formats/asciimath/parser";
import { toHtml } from "../../src/formats/html/renderer";
import { parseLatex } from "../../src/formats/latex/index";
import { parseMathml } from "../../src/formats/mathml/parser";
import { toOmml } from "../../src/formats/omml/renderer";

const PARSERS: Readonly<Record<string, (input: string) => MathNode>> = {
  asciimath: (input) => parseAsciimath(input),
  latex: (input) => parseLatex(input),
  mathml: (input) => parseMathml(input),
};

const TOKENS_008 = `<math xmlns="http://www.w3.org/1998/Math/MathML">
  <mrow intent="plus(x, y)">
    <mi>x</mi>
    <mo>+</mo>
    <mi>y</mi>
  </mrow>
</math>
`;

describe("HTML for left/right fences (testsuite #31)", () => {
  it.each([
    ["asciimath", "left( x right)", "<i>(</i> x <i>)</i>"],
    ["asciimath", "left[ x right]", "<i>[</i> x <i>]</i>"],
    ["asciimath", "left( a/b right)", "<i>(</i> <i>a</i><i>b</i> <i>)</i>"],
    ["latex", "\\left( a \\right)", "<i>(</i> a <i>)</i>"],
    ["latex", "\\left[ x \\right]", "<i>[</i> x <i>]</i>"],
    ["latex", "\\left\\{ a \\right\\}", "<i>{</i> a <i>}</i>"],
    ["latex", "\\left| x \\right|", "<i>|</i> x <i>|</i>"],
    ["latex", "\\left( a + b \\right)", "<i>(</i> a &#x2b; b <i>)</i>"],
    ["latex", "\\left( \\frac{a}{b} \\right)", "<i>(</i> <i>a</i><i>b</i> <i>)</i>"],
  ])("%s %s", (format, input, expected) => {
    const parse = PARSERS[format];
    if (parse === undefined) throw new Error(`no parser for ${format}`);
    expect(toHtml(parse(input))).toBe(expected);
  });
});

describe("Intent output (testsuite #30, mathml-tokens-008)", () => {
  it("writes only the content to HTML", () => {
    expect(toHtml(parseMathml(TOKENS_008))).toBe("<i>x &#x2b; y</i>");
  });

  it("writes only the content to OMML, as plain runs", () => {
    const omml = toOmml(parseMathml(TOKENS_008));
    expect(omml.slice(omml.indexOf("<m:oMath>"))).toBe(
      "<m:oMath>\n    <m:r>\n      <m:t>x</m:t>\n    </m:r>\n    <m:r>\n      <m:t>+</m:t>\n" +
        "    </m:r>\n    <m:r>\n      <m:t>y</m:t>\n    </m:r>\n  </m:oMath>\n</m:oMathPara>\n",
    );
  });
});
