/** biome-ignore-all lint/style/useNamingConvention: the gem's own option keys stay snake_case. */
/**
 * Ruby truthiness at the option and slot boundaries — the axis the positive
 * AsciiMath corpus cannot reach.
 *
 * Every case here needs a hand-built node carrying an option that is `nil` or
 * `false`, or a slot holding `false`. The parser never produces those, so the
 * 69 corpus cases pass whatever the port does with them. That is exactly why
 * this file exists: an adversarial review found seven divergences here after
 * the whole parity suite was green.
 *
 * Two Ruby rules generate all of them:
 *
 *  1. `options&.dig(:k)` and `options&.key?(:k)` are NOT the same test.
 *     `dig` is truthiness — `nil` and `false` both fail it. `key?` is
 *     presence — a key explicitly set to `nil` still passes. Reading a `dig`
 *     site as `!== undefined` accepts `null`, and reading it as
 *     `!== undefined && !== false` still accepts `null`.
 *  2. A bare `if parameter_one` guard rejects `false` as well as `nil`, while
 *     `&.` rejects only `nil`, and an unguarded call rejects neither — it
 *     raises for both.
 *
 * Measured against the pinned oracle (plurimath 0.11.6, 00c52783); the
 * transcript is quoted at each group.
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../../src/core/errors";
import {
  BaseNode,
  ColorNode,
  FormulaNode,
  FracNode,
  LinebreakNode,
  type MathNode,
  MpaddedNode,
  OversetNode,
  SymbolNode,
} from "../../../src/core/index";
import { toUnicodemath } from "../../../src/formats/unicodemath/renderer";

const sym = (value: string) => new SymbolNode({ id: "Symbol", value });

/**
 *   Color bg=nil   => "✎(red&x)"     Color bg=false => "✎(red&x)"
 *   Color bg="red" => "☁(red&x)"
 *
 * U+270E is the foreground operator, U+2601 the background one. A `nil` or
 * `false` background is NOT a background.
 */
describe("Color reads its background option as Ruby truthiness", () => {
  const color = (backgroundcolor: unknown) =>
    new ColorNode({
      parameterOne: sym("red"),
      parameterTwo: sym("x"),
      options: { backgroundcolor } as never,
    });

  it.each([
    ["null", null],
    ["false", false],
  ])("treats a %s background as no background", (_name, value) => {
    expect(toUnicodemath(color(value))).toBe("✎(red&x)");
  });

  it("treats a real background as a background", () => {
    expect(toUnicodemath(color("red"))).toBe("☁(red&x)");
  });
});

/**
 *   Color one=nil   !! NoMethodError
 *   Color one=false !! NoMethodError
 *
 * Both children are called WITHOUT `&.`, so neither absent nor false is
 * survivable.
 */
describe("Color refuses a missing child rather than rendering it empty", () => {
  it.each([
    ["null", null],
    ["false", false],
  ])("raises for a %s first child", (_name, value) => {
    expect(() =>
      toUnicodemath(
        new ColorNode({ parameterOne: value as never, parameterTwo: sym("x"), options: {} }),
      ),
    ).toThrow(RenderError);
  });
});

/**
 *   Frac unicodemath_fraction = nil   => nil        (so "" at the boundary)
 *                             = false => nil
 *                             = true  => "&#xbd;"
 *   Mpadded mpadded = nil   => "⟡(x)"
 *                   = false => "⟡(x)"
 *                   = true  => "(x)"
 *
 * Both sites are `options&.dig(...)`, i.e. truthiness, not key presence.
 */
describe("Frac and Mpadded read their options as Ruby truthiness", () => {
  const frac = (unicodemath_fraction: unknown) =>
    new FracNode({
      parameterOne: sym("1"),
      parameterTwo: sym("2"),
      options: { unicodemath_fraction } as never,
    });
  const mpadded = (mpadded_: unknown) =>
    new MpaddedNode({ parameterOne: sym("x"), options: { mpadded: mpadded_ } as never });

  it.each([
    ["null", null],
    ["false", false],
  ])("does not take Frac's fraction branch for %s", (_name, value) => {
    expect(toUnicodemath(frac(value))).toBe("");
  });

  it("takes Frac's fraction branch for true", () => {
    expect(toUnicodemath(frac(true))).toBe("&#xbd;");
  });

  it.each([
    ["null", null],
    ["false", false],
  ])("does not take Mpadded's branch for %s", (_name, value) => {
    expect(toUnicodemath(mpadded(value))).toBe("⟡(x)");
  });

  it("takes Mpadded's branch for true", () => {
    expect(toUnicodemath(mpadded(true))).toBe("(x)");
  });
});

/**
 *   Frac(nil, "2", {displaystyle: nil})  !! NoMethodError
 *
 * The `displaystyle` branch is selected by `key?` (so a nil VALUE still
 * selects it) and then calls both children unguarded.
 */
describe("Frac's displaystyle branch refuses a missing child", () => {
  it("raises rather than rendering half a fraction", () => {
    expect(() =>
      toUnicodemath(
        new FracNode({
          parameterOne: null as never,
          parameterTwo: sym("2"),
          options: { displaystyle: null } as never,
        }),
      ),
    ).toThrow(RenderError);
  });
});

/**
 *   Overset(nil, nil)     => nil   (so "" at the boundary)
 *   Overset(false, false) => nil
 *
 * The trailing `if parameter_one || parameter_two` is Ruby truthiness, so
 * `false` counts as absent — and absent means nil, NOT a crash.
 */
describe("Overset returns nothing when both slots are absent", () => {
  it.each([
    ["null", null],
    ["false", false],
  ])("renders empty for %s slots", (_name, value) => {
    const node = new OversetNode({
      parameterOne: value as never,
      parameterTwo: value as never,
    }) as MathNode;
    expect(toUnicodemath(node)).toBe("");
  });
});

/**
 *   Base(false, "x")  => "_(x)"
 *   Linebreak(false)  => "&#xa;"
 *
 * A bare `if parameter_one` guard: `false` contributes nothing and does not
 * raise.
 */
describe("a bare truthiness guard treats false as absent, not as an error", () => {
  it("skips Base's false first child", () => {
    expect(
      toUnicodemath(new BaseNode({ parameterOne: false as never, parameterTwo: sym("x") })),
    ).toBe("_(x)");
  });

  it("skips Linebreak's false child", () => {
    expect(toUnicodemath(new LinebreakNode({ parameterOne: false as never }))).toBe("&#xa;");
  });
});

/**
 *   Formula["a / b"].to_unicodemath => "a / b"
 *
 * The boundary squeeze is `gsub(/\s\/\s/, "/")`, and Ruby's `\s` is ASCII
 * only: space, tab, CR, LF, FF, VT. JavaScript's `\s` also matches U+00A0 and
 * U+2009, so a JS-flavoured regex collapses soliduses the gem preserves.
 */
describe("the boundary squeeze uses Ruby's whitespace class, not JavaScript's", () => {
  // The squeeze lives in `Formula#to_unicodemath`, so the node has to BE a
  // formula — a bare symbol never reaches the boundary pass.
  const formulaOf = (text: string) => new FormulaNode({ value: [sym(text)] });

  it("collapses an ASCII-spaced solidus", () => {
    expect(toUnicodemath(formulaOf("a / b"))).toBe("a/b");
  });

  it.each([
    ["a no-break space", "\u00a0"],
    ["a thin space", "\u2009"],
  ])("leaves a solidus delimited by %s alone", (_name, space) => {
    const text = `a${space}/${space}b`;
    expect(toUnicodemath(formulaOf(text))).toBe(text);
  });
});
