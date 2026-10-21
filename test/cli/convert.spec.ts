/**
 * `convert` unit tests (`src/cli/convert.ts`) — real conversions through the
 * compat `Plurimath` class, not mocks. Expected bytes are the same ones
 * `test/compat/plurimath-class.spec.ts` pins from the oracle
 * (`Plurimath::Math.parse("frac(1)(2)", :asciimath)`).
 */

import { describe, expect, it } from "vitest";
import {
  convert,
  INPUT_FORMATS,
  isInputFormat,
  isOutputFormat,
  OUTPUT_FORMATS,
} from "../../src/cli/convert";

const ASCIIMATH_INPUT = "frac(1)(2)";
const LATEX_INPUT = "\\frac{1}{2}";
const MATHML_INPUT =
  '<math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mn>1</mn><mn>2</mn></mfrac></math>';
const OMML_INPUT =
  '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:f><m:num><m:r><m:t>1</m:t></m:r></m:num><m:den><m:r><m:t>2</m:t></m:r></m:den></m:f></m:oMath>';

describe("format token guards", () => {
  it("names exactly the six working input formats", () => {
    expect(INPUT_FORMATS).toEqual(["asciimath", "latex", "mathml", "html", "unicodemath", "omml"]);
  });

  it("names exactly the six working output formats", () => {
    expect(OUTPUT_FORMATS).toEqual(["asciimath", "latex", "mathml", "html", "unicodemath", "omml"]);
  });

  it("isInputFormat accepts every input format and rejects unsupported ones", () => {
    for (const format of INPUT_FORMATS) expect(isInputFormat(format)).toBe(true);
    expect(isInputFormat("bogus")).toBe(false);
  });

  it("isOutputFormat accepts every output format", () => {
    for (const format of OUTPUT_FORMATS) expect(isOutputFormat(format)).toBe(true);
    expect(isOutputFormat("bogus")).toBe(false);
  });
});

describe("convert", () => {
  it("converts asciimath to latex", () => {
    expect(convert(ASCIIMATH_INPUT, "asciimath", "latex")).toBe(LATEX_INPUT);
  });

  it("converts latex to asciimath", () => {
    expect(convert(LATEX_INPUT, "latex", "asciimath")).toBe(ASCIIMATH_INPUT);
  });

  it("converts asciimath to unicodemath", () => {
    expect(convert(ASCIIMATH_INPUT, "asciimath", "unicodemath")).toBe("(1)/(2)");
  });

  it("round-trips through unicodemath as an input format", () => {
    const unicode = convert(ASCIIMATH_INPUT, "asciimath", "unicodemath");
    expect(convert(unicode, "unicodemath", "latex")).toBe(LATEX_INPUT);
  });

  it("converts asciimath to html", () => {
    expect(convert(ASCIIMATH_INPUT, "asciimath", "html")).toBe("<i>1</i><i>2</i>");
  });

  it("parses html as an input format", () => {
    // html rendering of a fraction is lossy (two italics, no <mfrac>-like
    // structure), so this checks html as an input format on its own terms
    // rather than asserting a round trip through it.
    expect(convert("<i>x</i>", "html", "asciimath")).toBe('"x"');
  });

  it("converts asciimath to mathml", () => {
    const out = convert(ASCIIMATH_INPUT, "asciimath", "mathml");
    expect(out).toContain("<mfrac>");
    expect(out).toContain("<mn>1</mn>");
  });

  it.each([
    ["mathml", MATHML_INPUT],
    ["omml", OMML_INPUT],
  ] as const)("converts %s input through the compat parser", (from, input) => {
    expect(convert(input, from, "latex")).toBe(LATEX_INPUT);
  });

  it("converts asciimath to omml", () => {
    expect(convert(ASCIIMATH_INPUT, "asciimath", "omml")).toContain("m:oMathPara");
  });

  it("surfaces a real parser error for malformed input", () => {
    expect(() => convert("\\frac{1}", "latex", "asciimath")).toThrow();
  });
});
