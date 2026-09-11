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
 * A list in `Number#value`, which this site used to LOSE.
 *
 * `Number#to_unicodemath` (`number.rb:52`) checks the two mini flags and
 * then rides `Formatter::Numbers::TextRenderer.render`, which answers
 * `result.to_s` for anything that is not a `FormattedNumber` — and
 * `Array#to_s` IS `Array#inspect`. Measured on the pinned oracle 00c52783
 * (plurimath 0.11.6, ruby 4.0.1; probe1.rb / probe3.rb / probe4.rb,
 * 2026-09-09):
 *
 *   Number.new([]).to_unicodemath(options: {})     => "[]"
 *   Number.new([nil]).to_unicodemath(options: {})  => "[nil]"
 *   Formula([Number([]), Symbol("x")])             => "[] x"
 *
 * The port returned the ARRAY OBJECT itself from a `string | null` renderer
 * — no error, no bytes. `String([])` is `""`, so the operand vanished from
 * every join it appeared in: the formula above rendered `" x"`, a leading
 * separator with nothing in front of it. A loud refusal is a bug a caller
 * can see; this one they could not.
 *
 * The mini flags are a SEPARATE answer at the same site, and they raise:
 * `mini_sub` is `unicode_const(:SUB_DIGITS)[value.to_sym]` (`number.rb:103`)
 * and an Array answers no `to_sym`.
 */
describe("a list in Number#value, which this site used to lose silently", () => {
  const number = (value: unknown, extra: Record<string, unknown> = {}) =>
    ({ kind: "number", value, ...extra }) as never;

  it("renders the list the gem inspects, where it returned a bare array before", () => {
    const rendered = toUnicodemath(number([]));
    expect(typeof rendered).toBe("string");
    expect(rendered).toBe("[]");
    expect(toUnicodemath(number([null]))).toBe("[nil]");
    expect(toUnicodemath(number([true, false]))).toBe("[true, false]");
    expect(toUnicodemath(number([[]]))).toBe("[[]]");
    expect(toUnicodemath(number(["x"]))).toBe('["x"]');
  });

  it("keeps the operand in a formula join instead of dropping it", () => {
    // Before: " x" — the number rendered to nothing and only the separator
    // survived. Measured on the oracle: "[] x" and "[nil] x".
    expect(
      toUnicodemath({
        kind: "formula",
        value: [number([]), { kind: "symbol", value: "x" }],
      } as never),
    ).toBe("[] x");
    expect(
      toUnicodemath({
        kind: "formula",
        value: [number([null]), { kind: "symbol", value: "x" }],
      } as never),
    ).toBe("[nil] x");
  });

  it("raises for a MINI-sized list, where the gem sends to_sym to the Array", () => {
    // Measured: Number.new([], mini_sub_sized: true).to_unicodemath raises
    // NoMethodError (undefined method 'to_sym' for an instance of Array),
    // and mini_sup_sized answers the same. The port returned "" here.
    expect(() => toUnicodemath(number([], { miniSubSized: true }))).toThrow(RenderError);
    expect(() => toUnicodemath(number([], { miniSupSized: true }))).toThrow(RenderError);
    expect(() => toUnicodemath(number([null], { miniSubSized: true }))).toThrow(/to_sym/);
  });

  it("still answers nil for a mini-sized STRING the digit tables miss", () => {
    // The mini flags are only fatal for a value that answers no `to_sym`.
    // Measured: "x" and "12" and "" are hash MISSES and return nil, which
    // the boundary spells as the empty string; "2" hits (=> "&#x2082;").
    expect(toUnicodemath(number("x", { miniSubSized: true }))).toBe("");
    expect(toUnicodemath(number("2", { miniSubSized: true }))).toBe("&#x2082;");
  });

  it('reads the mini flags with Ruby truthiness, so 0 and "" are SET', () => {
    // `number.rb:53-54` guards with a bare `if`, and in Ruby only nil and
    // false are falsy — `0` and `""` are TRUE. JavaScript disagrees on both,
    // so a `||` here answered as though the flag were unset. Measured on the
    // pinned oracle 00c52783 (probe-mini2.rb / probe-mini3.rb, 2026-09-09),
    // for both flags:
    //
    //   value [],  flag 0   => NoMethodError      flag false => "[]"
    //   value [],  flag ""  => NoMethodError      flag true  => NoMethodError
    //   value "1", flag 0   => "&#x2081;" (sub)   flag false => "1"
    //   value "1", flag ""  => "&#x2081;" (sub)   flag true  => "&#x2081;"
    for (const set of [0, ""]) {
      expect(() => toUnicodemath(number([], { miniSubSized: set }))).toThrow(RenderError);
      expect(() => toUnicodemath(number([], { miniSupSized: set }))).toThrow(RenderError);
      expect(toUnicodemath(number("1", { miniSubSized: set }))).toBe("&#x2081;");
      expect(toUnicodemath(number("1", { miniSupSized: set }))).toBe("&#xb9;");
    }
    // The other half of the same rule. Ruby has exactly two falsy values and
    // BOTH reach here: measured on the oracle, `nil` and `false` each fall
    // through to the formatter and answer "1" for the string and "[]" for the
    // list, while `0` takes the mini branch. The gem's own constructor stores
    // a nil flag unfiltered, so nil is a shape a caller can really produce.
    for (const unset of [false, null]) {
      expect(toUnicodemath(number([], { miniSubSized: unset }))).toBe("[]");
      expect(toUnicodemath(number("1", { miniSubSized: unset }))).toBe("1");
      expect(toUnicodemath(number([], { miniSupSized: unset }))).toBe("[]");
      expect(toUnicodemath(number("1", { miniSupSized: unset }))).toBe("1");
    }
  });

  it("refuses a float outside the band WITHOUT claiming the two disagree on it", () => {
    // The band is conservative, and this is the value that proves it: measured
    // on the pinned oracle, Ruby's `1202471614443916.8.to_s` and JavaScript's
    // `String(1202471614443916.8)` are the SAME string, yet the value sits
    // above `RUBY_PLAIN_FLOAT_MAX` and is refused. The refusal is right — Ruby
    // picks its format by more than magnitude, so the edge cannot be drawn
    // exactly — but the reason given must not assert a disagreement that is
    // not there.
    let thrown: unknown;
    try {
      toUnicodemath(number([1202471614443916.8]));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RenderError);
    const why = (thrown as Error).message;
    expect(why).toContain("VERIFIED");
    expect(why).not.toMatch(/range where Ruby's Float#to_s and JavaScript's agree/);
  });

  it("refuses the element shapes JavaScript cannot decide, naming the index", () => {
    // The same admission set as the latex site, because it is the same
    // TextRenderer ride: [5] and [5.0] are one JS number with two Ruby
    // preimages; an object's inspect carries a heap address; above U+0377
    // the port has no printability table.
    expect(() => toUnicodemath(number([5]))).toThrow(RenderError);
    expect(() => toUnicodemath(number([{}]))).toThrow(RenderError);
    expect(() => toUnicodemath(number(["π"]))).toThrow(RenderError);
    expect(() => toUnicodemath(number([null, 5]))).toThrow(/number\.value\[1\]/);
  });

  it("admits the same reproducible primitives the latex site admits", () => {
    expect(toUnicodemath(number([Number.NaN]))).toBe("[NaN]");
    expect(toUnicodemath(number([Number.POSITIVE_INFINITY]))).toBe("[Infinity]");
    expect(toUnicodemath(number([1.5]))).toBe("[1.5]");
    expect(toUnicodemath(number(["a\nb"]))).toBe('["a\\nb"]');
    // And refuses what the shape grammar refuses first, for the same reason
    // it does at the latex site (`src/core/validate.ts`).
    expect(() => toUnicodemath(number([5n]))).toThrow(/a node slot cannot hold a bigint/);
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
 *   Hom.instance_method(:to_unicodemath).owner    => UnaryFunction
 *   Merror.instance_method(:to_unicodemath).owner => Merror
 */
describe("Hom, a carrier-default unary name the AsciiMath transform cannot build", () => {
  it("renders the carrier default, invisible FUNCTION APPLICATION and all", () => {
    expect(toUnicodemath(new UnaryFunctionNode({ name: "Hom", parameterOne: sym("x") }))).toBe(
      "hom⁡x",
    );
    expect(toUnicodemath(new UnaryFunctionNode({ name: "Hom" }))).toBe("hom⁡");
  });

  it("still refuses a name whose gem class overrides to_unicodemath", () => {
    // Merror, not Mbox: Mbox is arm-rendered below, Merror is the same case
    // left unmeasured.
    expect(() =>
      toUnicodemath(new UnaryFunctionNode({ name: "Merror", parameterOne: sym("x") })),
    ).toThrow(RenderError);
  });
});

/**
 * Measured on the pinned oracle 00c52783, through a Formula, with Mbox.new(v)
 * against Text.new(v) in the same slot — identical on every shape, because
 * `mbox.rb:27-29` hands the slot to a fresh Text:
 *
 *   Mbox.instance_method(:to_unicodemath).owner => Mbox
 *   Formula([Mbox("hi")]).to_unicodemath  => "\"hi\""
 *   Formula([Mbox("a b")]).to_unicodemath => "\"a b\""
 *   Formula([Mbox("")]).to_unicodemath    => "\"\""
 *   Formula([Mbox(nil)]).to_unicodemath   => ""    (Text answers Ruby nil,
 *                                                   which the formula
 *                                                   boundary contributes
 *                                                   nothing for)
 *   Mbox.new(Symbols::Symbol("x")) => NoMethodError in Text's own start_with?
 */
describe("Mbox, a LaTeX-only name whose to_unicodemath delegates to Text", () => {
  it("renders the fresh Text the gem builds, quotes and no FUNCTION APPLICATION", () => {
    expect(toUnicodemath(new UnaryFunctionNode({ name: "Mbox", parameterOne: "hi" }))).toBe('"hi"');
    expect(toUnicodemath(new UnaryFunctionNode({ name: "Mbox", parameterOne: "a b" }))).toBe(
      '"a b"',
    );
    expect(toUnicodemath(new UnaryFunctionNode({ name: "Mbox", parameterOne: "" }))).toBe('""');
    expect(toUnicodemath(new UnaryFunctionNode({ name: "Mbox", parameterOne: null }))).toBe("");
  });

  it("refuses a node in the slot, where the gem's Text dies in start_with?", () => {
    expect(() =>
      toUnicodemath(new UnaryFunctionNode({ name: "Mbox", parameterOne: sym("x") })),
    ).toThrow(RenderError);
  });

  it("reads an ABSENT slot as the gem's nil, not as the empty string", () => {
    // §5's structural dispatch admits a plain object with the slot missing, and
    // `Mbox.new` stores nil. Measured on the pinned oracle 00c52783:
    //
    //   Formula([Mbox.new]).to_unicodemath     => ""      (Text answers nil)
    //   Formula([Mbox.new("")]).to_unicodemath => "\"\""  (two quote marks)
    //
    // `Text`'s own Ruby default is `""`, so the absent slot must be narrowed to
    // nil before a fresh Text is built or the second answer is given for the
    // first.
    const absent = { kind: "unaryFunction", name: "Mbox" } as unknown as MathNode;
    expect(toUnicodemath(absent)).toBe("");
  });

  it("reads false in the slot as the gem's nil, as Ruby truthiness does", () => {
    // `Text#to_unicodemath` opens `return unless value` — a nil TEST would be
    // `unless value.nil?`, and this is not that. Measured on the pinned oracle
    // 00c52783: `Text.new(false).to_unicodemath` is nil and
    // `Formula([Mbox.new(false)]).to_unicodemath` is "". The port threw here,
    // which was a defect in the Text renderer that this arm exposed.
    const falseSlot = {
      kind: "unaryFunction",
      name: "Mbox",
      parameterOne: false,
    } as unknown as MathNode;
    expect(toUnicodemath(falseSlot)).toBe("");
    const falseText = { kind: "text", parameterOne: false } as unknown as MathNode;
    expect(toUnicodemath(falseText)).toBe("");
  });
});
