/**
 * What each published subpath actually exports.
 *
 * The package-isolation gate proves a subpath *resolves* and pulls in nothing
 * forbidden. It does not prove the subpath exports anything useful — an entry
 * barrel that lost its re-export would still resolve, still ship, and still
 * pass that gate, while every consumer of it broke.
 *
 * This is the other half: the surface itself. Until these entries existed,
 * `parseAsciimath`, `toAsciimath`, `toLatex` and `toMathml` were exercised by
 * the whole suite and reachable by no consumer at all, because the export map
 * published only the model layer.
 *
 * Deliberately narrow. Each format exposes the directions it supports and the
 * option types that go with them; the grammar, the transform, `render-shared`
 * and the XML tree are how those work, not what a caller uses. A new export
 * here is a public-API decision and should fail this test until it is made
 * deliberately.
 */

import { describe, expect, it } from "vitest";
import * as asciimath from "../../src/formats/asciimath/index";
import * as latex from "../../src/formats/latex/index";
import * as mathml from "../../src/formats/mathml/index";

/** Runtime exports only — types erase, so they cannot be asserted here. */
const SURFACE: ReadonlyArray<readonly [string, Record<string, unknown>, readonly string[]]> = [
  ["./asciimath", asciimath, ["parseAsciimath", "toAsciimath"]],
  ["./latex", latex, ["toLatex"]],
  ["./mathml", mathml, ["toMathml"]],
];

describe.each(SURFACE.map((entry) => [entry[0], entry] as const))(
  "%s",
  (_name, [, mod, expected]) => {
    it("exports exactly its declared surface", () => {
      expect(Object.keys(mod).sort()).toStrictEqual([...expected].sort());
    });

    it("exports functions, not undefined bindings", () => {
      for (const name of expected) {
        expect(typeof mod[name]).toBe("function");
      }
    });
  },
);

describe("the subpaths actually work end to end", () => {
  it("parses AsciiMath and renders it back", () => {
    expect(asciimath.toAsciimath(asciimath.parseAsciimath("frac(1)(2)"))).toBe("frac(1)(2)");
  });

  it("renders a parsed formula as LaTeX", () => {
    expect(latex.toLatex(asciimath.parseAsciimath("frac(1)(2)"))).toBe("\\frac{1}{2}");
  });

  it("renders a parsed formula as MathML", () => {
    const out = mathml.toMathml(asciimath.parseAsciimath("frac(1)(2)"));
    expect(out).toContain("<mfrac>");
    expect(out.startsWith("<math")).toBe(true);
  });
});
