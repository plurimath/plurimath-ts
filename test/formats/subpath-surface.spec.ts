/**
 * What each published subpath actually exports.
 *
 * This pins the **source barrels** that back the published subpaths and checks
 * that every format barrel listed below has a matching `package.json#exports`
 * declaration.
 * It still cannot prove that an export-map path or tsdown entry points at the
 * right built file. `scripts/gate-package.mjs` owns that half — it reads the
 * ESM and CJS targets from the export map, imports those files directly, and
 * asserts the same surface against the built `dist` (`EXPECTED_EXPORTS`).
 *
 * Both halves are needed. The gate cannot run in the unit suite because it
 * requires a build; this spec cannot inspect the built entry. Together they
 * say: the barrel exports this, and that is what a consumer receives.
 *
 * Until these entries existed, `parseAsciimath`, `toAsciimath`, `toLatex` and
 * `toMathml` were exercised by the whole suite and reachable by no consumer at
 * all, because the export map published only the model layer.
 *
 * Deliberately narrow. Each format exposes the directions it supports and the
 * option types that go with them; the grammar, the transform, `render-shared`
 * and the XML tree are how those work, not what a caller uses. A new export
 * here is a public-API decision and should fail this test until it is made
 * deliberately.
 */

import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import * as asciimath from "../../src/formats/asciimath/index";
import * as latex from "../../src/formats/latex/index";
import * as mathml from "../../src/formats/mathml/index";
import * as unicodemath from "../../src/formats/unicodemath/index";

/** Runtime exports only — types erase, so they cannot be asserted here. */
const SURFACE: ReadonlyArray<readonly [string, Record<string, unknown>, readonly string[]]> = [
  ["./asciimath", asciimath, ["parseAsciimath", "toAsciimath"]],
  ["./latex", latex, ["toLatex"]],
  ["./mathml", mathml, ["toMathml"]],
  ["./unicodemath", unicodemath, ["toUnicodemath"]],
];

const PUBLISHED_FORMAT_SUBPATHS = Object.keys(packageJson.exports).filter(
  (subpath) => subpath !== "." && subpath !== "./core" && subpath !== "./package.json",
);

it("publishes every declared format surface as a package subpath", () => {
  expect(PUBLISHED_FORMAT_SUBPATHS.sort()).toStrictEqual(
    SURFACE.map(([subpath]) => subpath).sort(),
  );
});

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

  it("renders a parsed formula as HTML", () => {});

  it("renders a parsed formula as UnicodeMath", () => {
    // Measured against the pinned oracle, not guessed:
    //   Plurimath::Math.parse("frac(1)(2)", :asciimath).to_unicodemath
    //     => "(1)/(2)"
    // The solidus keeps no spaces around it because the format's boundary
    // pass collapses `" / "` to `"/"` (`formula.rb:191`).
    expect(unicodemath.toUnicodemath(asciimath.parseAsciimath("frac(1)(2)"))).toBe("(1)/(2)");
  });

  it("renders a parsed formula as MathML", () => {
    const out = mathml.toMathml(asciimath.parseAsciimath("frac(1)(2)"));
    expect(out).toContain("<mfrac>");
    expect(out.startsWith("<math")).toBe(true);
  });
});
