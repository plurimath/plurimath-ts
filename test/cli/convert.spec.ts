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
import Plurimath from "../../src/compat/index";
import { UnsupportedFormatError } from "../../src/core/index";

const ASCIIMATH_INPUT = "frac(1)(2)";
const LATEX_INPUT = "\\frac{1}{2}";

describe("format token guards", () => {
  it("names exactly the four working input formats", () => {
    expect(INPUT_FORMATS).toEqual(["asciimath", "latex", "html", "unicodemath"]);
  });

  it("names exactly the six working output formats", () => {
    expect(OUTPUT_FORMATS).toEqual(["asciimath", "latex", "mathml", "html", "unicodemath", "omml"]);
  });

  it("isInputFormat accepts input formats and rejects output-only ones", () => {
    expect(isInputFormat("asciimath")).toBe(true);
    expect(isInputFormat("mathml")).toBe(false);
    expect(isInputFormat("omml")).toBe(false);
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

  it("converts asciimath to omml", () => {
    expect(convert(ASCIIMATH_INPUT, "asciimath", "omml")).toContain("m:oMathPara");
  });

  it("surfaces a real parser error for malformed input", () => {
    expect(() => convert("\\frac{1}", "latex", "asciimath")).toThrow();
  });
});

describe("compat's unregistered input formats stay unreachable from convert's own type", () => {
  it("mathml and omml are excluded from InputFormat at compile time and at the compat layer", () => {
    // convert()'s InputFormat type already excludes "mathml"/"omml" at compile
    // time (isInputFormat above proves it at runtime); this asserts the layer
    // convert() delegates to, src/compat/index.ts, still refuses them too —
    // so a future typo in convert.ts's TO_COMPAT_INPUT_FORMAT map would fail
    // loudly here rather than silently misrouting.
    expect(() => new Plurimath("x", "mathml")).toThrow(UnsupportedFormatError);
    expect(() => new Plurimath("x", "omml")).toThrow(UnsupportedFormatError);
  });
});
