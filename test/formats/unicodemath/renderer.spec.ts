/** biome-ignore-all lint/style/useNamingConvention: the gem's own option keys stay snake_case. */
/**
 * Gem-pinned UnicodeMath behaviour the corpus cannot reach: hand-built nodes,
 * nil-slot combinations, and the option shapes the AsciiMath parser never
 * produces.
 *
 * Every expectation below was measured on the pinned oracle (plurimath
 * 0.11.6 at 00c52783) by instantiating the class and calling
 * `to_unicodemath(options: {})`. The measured transcript is quoted beside each
 * group; nothing here is read off the gem's source.
 *
 * Two things make this format's edges different from latex's:
 *
 *  1. **Entities are not decoded here.** `Formula#to_unicodemath` runs
 *     `html_entity_to_unicode` at its own boundary, so calling
 *     `to_unicodemath` on a node that is not a Formula returns raw entity
 *     text. The oracle gave `"(&#x2093;)"` for a mini-sized `x` inside a
 *     fence, and this port must give the same — decoding here would be the
 *     "more correct than the oracle" defect PORTING-STANDARDS.md forbids.
 *
 *  2. **`Fenced` crashes in five distinct places.** Its contents list, its
 *     open paren under `vert_paren?`, both parens under `mini_sized_unicode`,
 *     and `convert_paren_size` on a missing or non-positive size are all read
 *     without a guard. Each crash maps to `RenderError` (ARCHITECTURE.md §5).
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../../src/core/errors";
import {
  FencedNode,
  FracNode,
  type MathNode,
  NumberNode,
  SqrtNode,
  SymbolNode,
} from "../../../src/core/index";
import { toUnicodemath } from "../../../src/formats/unicodemath/renderer";

const sym = (value: string) => new SymbolNode({ id: "Symbol", value });
const lround = () => new SymbolNode({ id: "Paren::Lround", value: "(" });
const rround = () => new SymbolNode({ id: "Paren::Rround", value: ")" });
const vert = () => new SymbolNode({ id: "Paren::Vert", value: "|" });

function fenced(init: {
  one?: unknown;
  two?: unknown;
  three?: unknown;
  options?: Record<string, unknown>;
}): MathNode {
  return new FencedNode({
    parameterOne: init.one as never,
    parameterTwo: init.two as never,
    parameterThree: init.three as never,
    options: init.options as never,
  });
}

/**
 * Measured, verbatim from the oracle run:
 *
 *   parameter_two []                  => "()"
 *   plain (x)                         => "(x)"
 *   plain frac child, no opts         => "((n)/(k))"
 *   vert fence |x|                    => "|(x)|"
 *   mini contents, all present        => "(&#x2093;)"
 */
describe("Fenced renders what the gem renders", () => {
  it("gives an empty fence for an empty contents list", () => {
    expect(toUnicodemath(fenced({ one: lround(), two: [], three: rround() }))).toBe("()");
  });

  it("gives the plain fence", () => {
    expect(toUnicodemath(fenced({ one: lround(), two: [sym("x")], three: rround() }))).toBe("(x)");
  });

  it("parenthesises a frac child through unicodemath_parens", () => {
    const frac = new FracNode({ parameterOne: sym("n"), parameterTwo: sym("k") });
    expect(toUnicodemath(fenced({ one: lround(), two: [frac], three: rround() }))).toBe(
      "((n)/(k))",
    );
  });

  it("wraps the contents again when the fence is a vertical bar", () => {
    // `vert_paren?` is true, so the contents gain their OWN paren pair inside
    // the existing fence. Measured: "|(x)|", not "|x|".
    expect(toUnicodemath(fenced({ one: vert(), two: [sym("x")], three: vert() }))).toBe("|(x)|");
  });

  it("leaves HTML entities encoded, because only a Formula decodes them", () => {
    const mini = new SymbolNode({ id: "Symbol", value: "x", miniSubSized: true });
    expect(toUnicodemath(fenced({ one: lround(), two: [mini], three: rround() }))).toBe(
      "(&#x2093;)",
    );
  });
});

/**
 * `Frac#choose_frac` is rendered by the FENCE. Measured:
 *
 *   choose frac ONLY element   => "(n)⒞(k)"
 *   choose frac FIRST of two   => "(n)⒞(k) a"
 *   choose frac SECOND of two  => "(a (n)⒞(k))"
 *
 * Position is the whole point: a LEADING choose-frac replaces the fence,
 * parens included, and a trailing one does not.
 */
describe("a choose-frac child", () => {
  const choose = () =>
    new FracNode({
      parameterOne: sym("n"),
      parameterTwo: sym("k"),
      options: { choose: true } as never,
    });

  it("replaces the whole fence when it is the only element", () => {
    expect(toUnicodemath(fenced({ one: lround(), two: [choose()], three: rround() }))).toBe(
      "(n)⒞(k)",
    );
  });

  it("still replaces the fence when it merely comes first", () => {
    expect(
      toUnicodemath(fenced({ one: lround(), two: [choose(), sym("a")], three: rround() })),
    ).toBe("(n)⒞(k) a");
  });

  it("does NOT replace the fence when it comes second", () => {
    expect(
      toUnicodemath(fenced({ one: lround(), two: [sym("a"), choose()], three: rround() })),
    ).toBe("(a (n)⒞(k))");
  });
});

/**
 * The paren options. Measured:
 *
 *   {open_paren: {minsize: "0.5em"}}  => "├-3(x)"
 *   {open_paren: {minsize: "2em"}}    => "├3(x)"
 *   {open_prefixed: true}, plain      => "├(x)"
 *   {open_prefixed: true}, open "{:"  => "├x)"
 *   no options, open "{:"             => "├x┤"
 *   {close_prefixed: true}, plain     => "(x┤)"
 */
describe("the prefixed and sized parens", () => {
  const body = { two: [sym("x")], three: rround() };

  it.each([
    ["0.5em", "├-3(x)"],
    ["2em", "├3(x)"],
  ])("sizes an open paren of %s", (minsize, expected) => {
    expect(
      toUnicodemath(fenced({ one: lround(), ...body, options: { open_paren: { minsize } } })),
    ).toBe(expected);
  });

  it("prefixes a plain open paren", () => {
    expect(
      toUnicodemath(fenced({ one: lround(), ...body, options: { open_prefixed: true } })),
    ).toBe("├(x)");
  });

  it("drops the paren when it is already a begin marker", () => {
    expect(
      toUnicodemath(fenced({ one: sym("{:"), ...body, options: { open_prefixed: true } })),
    ).toBe("├x)");
  });

  it("turns a bare {: and :} pair into the markers, with no options at all", () => {
    expect(toUnicodemath(fenced({ one: sym("{:"), two: [sym("x")], three: sym(":}") }))).toBe(
      "├x┤",
    );
  });

  it("prefixes the closing paren", () => {
    expect(
      toUnicodemath(fenced({ one: lround(), ...body, options: { close_prefixed: true } })),
    ).toBe("(x┤)");
  });
});

/**
 * Where the gem CRASHES. Measured, each with the exact Ruby error:
 *
 *   parameter_two nil              !! NoMethodError  (nil.first)
 *   mini contents, open nil        !! NoMethodError  (nil.to_unicodemath)
 *   vert_paren? open nil           !! NoMethodError  (nil.class_name)
 *   {open_paren: {}}               !! NoMethodError  (nil.delete_suffix)
 *   convert_paren_size "abc"/"0em" !! FloatDomainError (-Infinity)
 *   convert_paren_size "-1em"      !! Math::DomainError
 *
 * All six map to RenderError — never a TypeError escaping the walk.
 */
describe("Fenced raises where the gem raises", () => {
  const cases: ReadonlyArray<readonly [string, () => MathNode]> = [
    ["a nil contents list", () => fenced({ one: lround(), three: rround() })],
    [
      "a nil open paren under mini sizing",
      () =>
        fenced({
          two: [new SymbolNode({ id: "Symbol", value: "x", miniSubSized: true })],
          three: rround(),
        }),
    ],
    ["a nil open paren otherwise", () => fenced({ two: [sym("x")], three: rround() })],
    [
      "an open_paren option with no minsize",
      () =>
        fenced({
          one: lround(),
          two: [sym("x")],
          three: rround(),
          options: { open_paren: {} },
        }),
    ],
    ...(["abc", "0em", "-1em"] as const).map(
      (minsize) =>
        [
          `a minsize of ${minsize}`,
          () =>
            fenced({
              one: lround(),
              two: [sym("x")],
              three: rround(),
              options: { open_paren: { minsize } },
            }),
        ] as const,
    ),
  ];

  it.each(cases.map(([name, build]) => [name, build] as const))("%s", (_name, build) => {
    expect(() => toUnicodemath(build())).toThrow(RenderError);
  });
});

/**
 * A slot the gem reads with `&.` guards nil and NOTHING else. Measured:
 *
 *   nil&.to_unicodemath    => nil
 *   "x".to_unicodemath     !! NoMethodError
 *   [].to_unicodemath      !! NoMethodError
 *   false&.to_unicodemath  !! NoMethodError
 *
 * and a slot read WITHOUT `&.` refuses nil too:
 *
 *   Sqrt(nil)              !! NoMethodError
 *   Sqrt("x")              !! NoMethodError
 */
describe("non-node slots raise rather than rendering as empty", () => {
  it.each([
    ["a bare string", "x"],
    ["a list", []],
    ["false", false],
  ])("refuses %s in a fence's contents", (_name, value) => {
    expect(() => toUnicodemath(fenced({ one: lround(), two: [value], three: rround() }))).toThrow(
      RenderError,
    );
  });

  it("refuses a nil slot the gem reads without a guard", () => {
    expect(() => toUnicodemath(new SqrtNode({}))).toThrow(RenderError);
  });
});

/**
 * The public boundary, measured through the real parse path:
 *
 *   Plurimath::Math.parse("frac(1)(2)", :asciimath).to_unicodemath => "(1)/(2)"
 *   Plurimath::Math.parse("x^2",        :asciimath).to_unicodemath => "x^(2)"
 */
describe("the boundary", () => {
  it("collapses ' / ' to '/' at the formula boundary", () => {
    // The frac renders `(1) / (2)`; `Formula#to_unicodemath` squeezes it.
    const frac = new FracNode({
      parameterOne: new NumberNode({ value: "1" }),
      parameterTwo: new NumberNode({ value: "2" }),
    });
    expect(toUnicodemath(frac)).toBe("(1)/(2)");
  });

  it("reports the format on its errors, so a caller can branch without parsing prose", () => {
    try {
      toUnicodemath(fenced({ one: lround(), three: rround() }));
      throw new Error("expected a RenderError");
    } catch (error) {
      expect(error).toBeInstanceOf(RenderError);
      expect((error as RenderError).format).toBe("unicodemath");
    }
  });
});
