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
  UnaryFunctionNode,
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
    // Ruby's `to_f` reads an exponent: "1e1em" -> "1e1" -> 10.0. Measured.
    ["1e1em", "├10(x)"],
    // Ruby's `to_f` accepts a leading dot and treats an underscore as legal
    // only BETWEEN digits, stopping at a doubled one. Measured:
    //   ".5".to_f   => 0.5     log(0.5)/log(1.25)  rounds to -3
    //   "1__0".to_f => 1.0     log(1)/log(1.25)    is 0
    // The first version of the port's pattern required a leading digit (so
    // ".5em" fell to the crash branch) and stripped every underscore (so
    // "1__0em" became 10).
    [".5em", "├-3(x)"],
    ["1__0em", "├0(x)"],
    ["1_0em", "├10(x)"],
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
    // `Infinity` and `NaN` are JavaScript float spellings that Ruby's `to_f`
    // does NOT accept — it returns 0.0, so the gem reaches log(0) and raises.
    // `parseFloat` accepted them and this port emitted `├Infinity(x)`.
    ...(["abc", "0em", "-1em", "Infinityem", "NaNem", "0x10em"] as const).map(
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

  it.each([
    // The two overflow directions reach DIFFERENT Ruby errors, and this port
    // reported both as FloatDomainError because `to_f`'s ±Infinity was folded
    // to zero before the sign was tested. Measured on the oracle:
    ["-1e400em", "Math::DomainError"],
    ["1e400em", "FloatDomainError"],
    ["1e309em", "FloatDomainError"],
    ["-2em", "Math::DomainError"],
    ["0em", "FloatDomainError"],
  ])("names the Ruby error the gem raises for %s", (minsize, gemError) => {
    // Throwing is not enough here: the message is what tells a reader which
    // gem branch they landed in, and it was wrong for the negative overflow.
    expect(() =>
      toUnicodemath(
        fenced({
          one: lround(),
          two: [sym("x")],
          three: rround(),
          options: { open_paren: { minsize } },
        }),
      ),
    ).toThrow(gemError);
  });

  it("rounds the reachable half-way tie as Ruby does", () => {
    // `log(0.45794672179195689)/log(1.25)` is exactly -3.5. Ruby rounds half
    // away from zero to -4; `Math.round` would give -3. Measured: the gem emits
    // "├-4(x)". This is the tie that makes `rubyRound` load-bearing rather than
    // theoretical.
    expect(
      toUnicodemath(
        fenced({
          one: lround(),
          two: [sym("x")],
          three: rround(),
          options: { open_paren: { minsize: "0.45794672179195689em" } },
        }),
      ),
    ).toBe("├-4(x)");
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

/**
 * Measured, verbatim from the oracle run:
 *
 *   Hom.new(Symbol("x")).to_unicodemath  => "hom⁡x"
 *   Hom.new(nil).to_unicodemath          => "hom⁡"
 *   Hom.instance_method(:to_unicodemath).owner  => UnaryFunction
 *   Mbox.instance_method(:to_unicodemath).owner => Mbox
 */
describe("Hom, a carrier-default unary name the AsciiMath transform cannot build", () => {
  it("renders the carrier default, invisible FUNCTION APPLICATION and all", () => {
    expect(toUnicodemath(new UnaryFunctionNode({ name: "Hom", parameterOne: sym("x") }))).toBe(
      "hom⁡x",
    );
    expect(toUnicodemath(new UnaryFunctionNode({ name: "Hom" }))).toBe("hom⁡");
  });

  it("still refuses a name whose gem class overrides to_unicodemath", () => {
    expect(() =>
      toUnicodemath(new UnaryFunctionNode({ name: "Mbox", parameterOne: sym("x") })),
    ).toThrow(RenderError);
  });
});
