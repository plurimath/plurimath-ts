/**
 * The `plurimath-js` compat class.
 *
 * Two things are pinned here and they are different: that the SURFACE matches
 * the wrapper's declaration exactly, and that each method's BYTES match the
 * gem. A class with the right method names and wrong output would satisfy only
 * the first, which is why the expectations below are measured oracle bytes
 * rather than whatever the port happens to emit.
 *
 * Oracle: /home/apple/ruby_gems/plurimath-oracle at 00c52783, gem 0.11.6,
 * `Plurimath::Math.parse("frac(1)(2)", :asciimath)`.
 */

import { describe, expect, it } from "vitest";
import Plurimath, { FORMATS, type Format } from "../../src/compat/index";
import { UnsupportedFeatureError, UnsupportedFormatError } from "../../src/core/index";
import RootDefault, { Plurimath as RootNamed } from "../../src/index";

const INPUT = "frac(1)(2)";
const build = () => new Plurimath(INPUT, "asciimath");

/** Measured: `Plurimath::Math.parse("frac(1)(2)", :asciimath).to_<format>`. */
const GEM_OUTPUT = {
  toAsciimath: "frac(1)(2)",
  toLatex: "\\frac{1}{2}",
  toUnicodemath: "(1)/(2)",
  toHtml: "<i>1</i><i>2</i>",
} as const;

describe("the compat class matches the plurimath-js surface", () => {
  /**
   * Source head `ce297e2` `src/index.ts` declares exactly these seven, in this
   * order. The published `0.2.2` artifact has six — no `toUnicodemath` — and
   * this port deliberately targets source head (see the class's own header).
   */
  const DeclaredMethods = [
    "toAsciimath",
    "toLatex",
    "toMathml",
    "toHtml",
    "toOmml",
    "toDisplay",
    "toUnicodemath",
  ] as const;

  it("declares every wrapper method and no others", () => {
    const own = Object.getOwnPropertyNames(Plurimath.prototype)
      .filter((name) => name !== "constructor")
      .sort();
    expect(own).toEqual([...DeclaredMethods].sort());
  });

  /**
   * The wrapper is a DEFAULT export — consumers write
   * `import Plurimath from "@plurimath/plurimath"`. The package-isolation gate
   * enumerates named exports only, so nothing there can see this; it is
   * asserted here instead.
   */
  it("is the package root's default export, and its named one", () => {
    expect(RootDefault).toBe(Plurimath);
    expect(RootNamed).toBe(Plurimath);
  });

  it("exposes `data` as a readable formula, not an Opal parser result", () => {
    const formula = build();
    expect(formula.data).toBeDefined();
    expect(formula.data.kind).toBe("formula");
  });

  it("names the six constructor formats the wrapper names", () => {
    expect(FORMATS).toEqual(["asciimath", "latex", "mathml", "html", "unicode", "omml"]);
  });

  it("uses `unicode`, the gem's spelling, not the published `mahtml` typo", () => {
    expect(FORMATS).toContain("unicode");
    expect(FORMATS as readonly string[]).not.toContain("mahtml");
    expect(FORMATS as readonly string[]).not.toContain("unicodemath");
  });
});

describe("the constructor's staged contract", () => {
  it("parses asciimath", () => {
    expect(() => build()).not.toThrow();
  });

  /** Five of six raise today. Asserted per format so it cannot drift quietly. */
  it.each(FORMATS.filter((f) => f !== "asciimath"))(
    "raises UnsupportedFormatError for %s, which has no parser yet",
    (format: Format) => {
      expect(() => new Plurimath(INPUT, format)).toThrow(UnsupportedFormatError);
    },
  );

  it("names the format it refused", () => {
    expect(() => new Plurimath(INPUT, "latex")).toThrow(/latex/);
  });
});

describe("each method renders the gem's bytes", () => {
  const Renderers: Readonly<Record<keyof typeof GEM_OUTPUT, (f: Plurimath) => string>> = {
    toAsciimath: (f) => f.toAsciimath(),
    toLatex: (f) => f.toLatex(),
    toUnicodemath: (f) => f.toUnicodemath(),
    toHtml: (f) => f.toHtml(),
  };

  it.each(Object.keys(GEM_OUTPUT) as (keyof typeof GEM_OUTPUT)[])("%s", (method) => {
    expect(Renderers[method](build())).toBe(GEM_OUTPUT[method]);
  });

  it("toMathml renders the gem's tree", () => {
    const out = build().toMathml();
    expect(out).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML" display="block">');
    expect(out).toContain("<mfrac>");
    expect(out).toContain("<mn>1</mn>");
  });

  it("toOmml renders an OMML document", () => {
    expect(build().toOmml()).toContain("m:oMathPara");
  });
});

describe("the two methods that cannot be honest yet", () => {
  /**
   * Measured on the oracle: `to_mathml(intent: false)` is byte-identical to
   * `to_mathml` with no keyword, so delegating the default path loses nothing.
   */
  it("toMathml() and toMathml(false) agree, as they do in the gem", () => {
    expect(build().toMathml(false)).toBe(build().toMathml());
  });

  it("toMathml(true) refuses rather than invent an intent attribute", () => {
    expect(() => build().toMathml(true)).toThrow(UnsupportedFeatureError);
  });

  it("toDisplay refuses, naming what is missing", () => {
    expect(() => build().toDisplay("latex")).toThrow(UnsupportedFeatureError);
    expect(() => build().toDisplay("latex")).toThrow(/math-zone/);
  });

  /**
   * `code` is the discriminator and `format`/`feature` are API
   * (`src/core/errors.ts:1-8`), so neither may carry prose. An unported
   * FEATURE is not an unsupported FORMAT: collapsing them would leave a
   * consumer unable to tell "not a format" from "this port cannot do that
   * yet", and would put a sentence in a field typed as a format token.
   */
  it("discriminates an unported feature from an unsupported format", () => {
    const codes: Record<string, string> = {};
    const fields: Record<string, string> = {};
    for (const [label, run] of [
      ["ctor", () => new Plurimath(INPUT, "latex")],
      ["toMathml", () => build().toMathml(true)],
      ["toDisplay", () => build().toDisplay("latex")],
    ] as const) {
      try {
        run();
        throw new Error(`${label} did not throw`);
      } catch (error) {
        const e = error as UnsupportedFormatError | UnsupportedFeatureError;
        codes[label] = e.code;
        fields[label] = "format" in e ? e.format : e.feature;
      }
    }
    expect(codes).toEqual({
      ctor: "UNSUPPORTED_FORMAT",
      toMathml: "UNSUPPORTED_FEATURE",
      toDisplay: "UNSUPPORTED_FEATURE",
    });
    // stable identifiers, not sentences
    expect(fields).toEqual({
      ctor: "latex",
      toMathml: "toMathml(intent: true)",
      toDisplay: "toDisplay",
    });
    for (const value of Object.values(fields)) expect(value).not.toMatch(/\s\w+\s\w+\s\w+\s/);
  });

  /**
   * `readonly` on a class field is erased at compile time. A JavaScript
   * consumer -- the majority here -- would still be able to reassign `data`
   * and change what every later method renders, which is the exact defect the
   * published class has. Installed with `writable: false` instead.
   */
  it("makes `data` readonly at runtime, not only to TypeScript", () => {
    const formula = build();
    expect(Object.getOwnPropertyDescriptor(formula, "data")?.writable).toBe(false);

    // The guarantee is that the value does not change, NOT that assigning
    // throws. Assigning to a non-writable property throws only in strict mode;
    // this package also ships CJS, and a `require()` consumer in sloppy mode
    // gets a silent no-op instead. Measured both ways: sloppy `threw=false`,
    // strict `threw=true`, and the value held in both. So the assertion is on
    // the value, and the throw is tolerated rather than required.
    const before = formula.data;
    try {
      (formula as unknown as { data: unknown }).data = new Plurimath("x+y", "asciimath").data;
    } catch {
      // strict mode: TypeError, which is the stricter of the two behaviours
    }
    expect(formula.data).toBe(before);
    expect(formula.toLatex()).toBe(GEM_OUTPUT.toLatex);
  });
});
