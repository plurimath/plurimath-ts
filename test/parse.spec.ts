/** Root routing tests; parser parity remains owned by each format's suites. */
import { describe, expect, it } from "vitest";

import { parseAsciimath } from "../src/formats/asciimath/index";
import { parseHtml } from "../src/formats/html/index";
import { parseLatex } from "../src/formats/latex/index";
import { parseMathml } from "../src/formats/mathml/index";
import { parseOmml } from "../src/formats/omml/index";
import { parseUnicodemath } from "../src/formats/unicodemath/index";
import { UnsupportedLocaleError } from "../src/formatting/index";
import {
  type Format,
  FormulaNode,
  InvalidTypeError,
  normalize,
  ParseError,
  ParseOptionError,
  parse,
  UnsupportedFormatError,
} from "../src/index";

const MATHML = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>';
const OMML =
  '<m:oMath xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><m:r><m:t>x</m:t></m:r></m:oMath>';
const TEXT_ROUTES = [
  ["asciimath", "frac(1)(2)", parseAsciimath],
  ["latex", "\\frac{1}{2}", parseLatex],
  ["html", "<i>x</i>", parseHtml],
  ["unicode", "(1)/(2)", parseUnicodemath],
] as const;
const ROUTES = [
  ...TEXT_ROUTES,
  ["mathml", MATHML, parseMathml],
  ["omml", OMML, parseOmml],
] as const;

describe("root parse", () => {
  it.each(ROUTES)("routes %s to its public parser", (format, input, direct) => {
    const formula = parse(input, format);
    expect(formula).toBeInstanceOf(FormulaNode);
    expect(normalize(formula)).toStrictEqual(normalize(direct(input)));
  });

  it.each(TEXT_ROUTES)("forwards %s locale options", (format, input, direct) => {
    const options = { locale: "de" };
    expect(normalize(parse(input, format, options))).toStrictEqual(
      normalize(direct(input, options)),
    );
  });

  it("applies the locale to a decimal whose default parse differs", () => {
    const localized = normalize(parse("1,5", "asciimath", { locale: "de" }));
    expect(localized).toStrictEqual(normalize(parseAsciimath("1,5", { locale: "de" })));
    expect(localized).not.toStrictEqual(normalize(parse("1,5", "asciimath")));
  });

  it("forwards the AsciiMath unsupported-construct callback", () => {
    const reported: unknown[] = [];
    parse('"unitsml(kg)"', "asciimath", {
      onUnsupported: (diagnostic) => reported.push(diagnostic),
    });
    expect(reported).toHaveLength(1);
  });

  it.each(["mathml", "omml"] as const)("%s accepts absent, null and empty options", (format) => {
    const input = format === "mathml" ? MATHML : OMML;
    expect(normalize(parse(input, format, {}))).toStrictEqual(normalize(parse(input, format)));
    expect(normalize(parse(input, format, null))).toStrictEqual(normalize(parse(input, format)));
  });

  it.each(["mathml", "omml"] as const)("%s rejects options before malformed XML", (format) => {
    // Runtime protection for JavaScript callers, beyond the declared option type.
    const options = { locale: "de" } as never;
    expect(() => parse("not XML", format, options)).toThrow(ParseOptionError);
    expect(() => parse("not XML", format)).toThrow(ParseError);
  });

  it.each(["asciimath", "latex", "html", "unicode"] as const)(
    "%s preserves existing option validation errors",
    (format) => {
      expect(() => parse("x", format, { unknown: true } as never)).toThrow(ParseOptionError);
      expect(() => parse("x", format, { locale: "unsupported-locale" })).toThrow(
        UnsupportedLocaleError,
      );
    },
  );

  it.each(["bogus", "unicodemath", "ASCIIMATH", null, 42])(
    "refuses an invalid runtime format %s",
    (format) => {
      expect(() => parse("x", format as Format)).toThrow(InvalidTypeError);
    },
  );

  it("recognizes deferred UnitsML separately from an invalid format", () => {
    expect(() => parse("x", "unitsml" as Format)).toThrow(UnsupportedFormatError);
  });
});

// Compile-only contract checks run with pnpm typecheck on GHA.
function optionTypes(): void {
  const formula: FormulaNode = parse("x", "asciimath", { locale: "de" });
  void formula;
  parse("x", "unicode", { onUnsupported: () => {} });
  parse(MATHML, "mathml", {});
  parse(OMML, "omml", null);
  // @ts-expect-error XML parsers accept no locale option.
  parse(MATHML, "mathml", { locale: "de" });
  // @ts-expect-error XML parsers accept no unsupported-construct hook.
  parse(OMML, "omml", { onUnsupported: () => {} });
  // @ts-expect-error The root ABI uses unicode, not unicodemath.
  parse("x", "unicodemath");
  // @ts-expect-error UnitsML is deferred and not a typed input format.
  parse("x", "unitsml");
}
void optionTypes;
