/**
 * The UnicodeMath predicate surface, pinned against the gem.
 *
 * `miniSized`, `primeUnicode` and `negatedValue` are the part of this format
 * that no other renderer needs: a parent asks a question of its child, and the
 * answer changes the *parent's* output. They are also the easiest thing in the
 * port to get quietly wrong, because every one of them defaults to false — a
 * wrong answer for one node kind is invisible on every other shape, and shows
 * up as a separator that appears or a sub/sup pair that swaps.
 *
 * Every expectation below was measured against the pinned oracle (plurimath
 * 0.11.6, 00c52783) by constructing the shape in Ruby and calling the gem's
 * own predicate. The table is the measurement, not a description of it.
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../../src/core/errors";
import {
  AbsNode,
  FencedNode,
  FormulaNode,
  FracNode,
  MpaddedNode,
  MrowNode,
  NaryNode,
  NumberNode,
  OversetNode,
  SymbolNode,
  UndersetNode,
} from "../../../src/core/index";
import {
  miniSized,
  negatedValue,
  primeUnicode,
  unicodemathFieldValue,
} from "../../../src/formats/unicodemath/render-shared";
import { toUnicodemath } from "../../../src/formats/unicodemath/renderer";

const plainSymbol = () => new SymbolNode({ id: "Symbol", value: "x" });
const miniSymbol = (which: "sub" | "sup") =>
  new SymbolNode({
    id: "Symbol",
    value: "x",
    miniSubSized: which === "sub",
    miniSupSized: which === "sup",
  });
const plainNumber = () => new NumberNode({ value: "2" });
const miniNumber = () => new NumberNode({ value: "2", miniSubSized: true });
const paren = (id: string) => new SymbolNode({ id });

/** gem `mini_sized?`, measured shape by shape. */
const MINI_SIZED: ReadonlyArray<readonly [string, () => unknown, boolean]> = [
  ["a plain symbol", plainSymbol, false],
  ["a symbol flagged mini-sub", () => miniSymbol("sub"), true],
  ["a symbol flagged mini-sup", () => miniSymbol("sup"), true],
  ["a plain number", plainNumber, false],
  ["a number flagged mini-sub", miniNumber, true],
  [
    "a formula whose FIRST child is mini",
    () => new FormulaNode({ value: [miniSymbol("sub"), plainSymbol()] }),
    true,
  ],
  [
    "a formula whose SECOND child is mini",
    () => new FormulaNode({ value: [plainSymbol(), miniSymbol("sub")] }),
    // The case that separates "first child" from "any child". A reading of
    // `Formula#mini_sized?` that asks every child answers true here and the
    // gem answers false, which surfaces as a join separator that should not
    // be there.
    false,
  ],
  ["an empty formula", () => new FormulaNode({ value: [] }), false],
  [
    "a fenced whose contents are mini",
    () =>
      // `Fenced#mini_sized?` asks parameterOne, `Formula.new(parameterTwo)`
      // and parameterThree — the open paren, the contents, the close paren.
      new FencedNode({
        parameterOne: paren("Paren::Lround"),
        parameterTwo: [miniSymbol("sub")],
        parameterThree: paren("Paren::Rround"),
      }),
    true,
  ],
  [
    "a plain fenced",
    () =>
      new FencedNode({
        parameterOne: paren("Paren::Lround"),
        parameterTwo: [plainSymbol()],
        parameterThree: paren("Paren::Rround"),
      }),
    false,
  ],
  [
    "a frac, which takes the default",
    () => new FracNode({ parameterOne: plainSymbol(), parameterTwo: plainSymbol() }),
    false,
  ],
];

describe("miniSized matches the gem", () => {
  it.each(MINI_SIZED.map(([name, build, expected]) => [name, build, expected] as const))(
    "%s",
    (_name, build, expected) => {
      expect(miniSized(build() as never)).toBe(expected);
    },
  );

  it("covers both answers, so the table is not all one value", () => {
    const answers = MINI_SIZED.map(([, , expected]) => expected);
    expect(answers).toContain(true);
    expect(answers).toContain(false);
  });
});

/**
 * gem `prime_unicode?`, measured. It matches on the symbol's rendered value,
 * not on its class, so the whole prime family answers true — probing only the
 * four `PREFIXED_PRIMES` classes suggests a four-class rule that is not the
 * rule.
 */
/**
 * Concrete symbol CLASSES, by the id the port carries. The gem reads each
 * one's `hexcode_in_input` — raw entity text — and asks whether it contains a
 * prime entity, so these are pinned by id rather than by rendered glyph.
 * `Sprime` is the bare apostrophe. Measured against the pinned oracle.
 */
const PRIME: ReadonlyArray<readonly [string, boolean]> = [
  ["Prime", true],
  ["Dprime", true],
  ["Second", true],
  ["Third", true],
  ["Qprime", true],
  ["Sprime", true],
  ["Sum", false],
  ["Alpha", false],
];

describe("primeUnicode matches the gem", () => {
  it.each(PRIME)("%s", (id, expected) => {
    expect(primeUnicode(new SymbolNode({ id }))).toBe(expected);
  });

  it("is false for a formula, however many primes it holds", () => {
    // The gem's first line is `return false unless field.is_a?(Symbols::Symbol)`,
    // so a formula wrapping a prime never triggers the swap. Measured: false.
    expect(primeUnicode(new FormulaNode({ value: [plainSymbol()] }))).toBe(false);
  });

  it("raises for a generic symbol holding no value at all", () => {
    // This pinned `false` while the implementation compared decoded glyphs: a
    // valueless symbol rendered to nothing, and nothing matched. The gem does
    // not get that far — `unicodemath_field_value` returns `field.value`, which
    // is nil, and the next line calls `.include?` on it. Measured:
    //
    //   gem   prime_unicode?(Symbols::Symbol.new(nil))     !! NoMethodError
    //   gem   PowerBase(x, a, Symbol(nil)).to_unicodemath  !! NoMethodError
    //   port  (before)                                     => "x_(a)^()"
    //
    // `new SymbolNode()` is the public model API and produces exactly this, so
    // the shape is reachable rather than theoretical.
    expect(() => primeUnicode(new SymbolNode({ id: "Symbol" }))).toThrow(RenderError);
    expect(() => primeUnicode(new SymbolNode())).toThrow(RenderError);
  });

  it("is true for a generic symbol carrying the RAW apostrophe entity", () => {
    // The gem's first test reads `field.value` before anything is rendered:
    //   prime_unicode?(Symbol("&#x27;"))          => true
    //   Symbol("&#x27;").to_unicodemath           => "&#x27;"   (undecoded)
    //   Power(x, Symbol("&#x27;")).to_unicodemath => "x&#x27;"  (accented)
    // so the render matches no glyph and the value test is what fires. An
    // implementation that only compares decoded glyphs answers false here and
    // silently loses the sub/sup swap for every hand-built or MathML-parsed
    // tree. Measured against the pinned oracle.
    const raw = new SymbolNode({ id: "Symbol", value: "&#x27;" });
    expect(primeUnicode(raw)).toBe(true);
  });

  it.each([
    ["&#x2032;", "prime"],
    ["&#x2033;", "double prime"],
    ["&#x2034;", "triple prime"],
    ["&#x2057;", "quadruple prime"],
    ["&#x27;", "apostrophe"],
  ])("is true for a generic symbol carrying the raw %s entity", (entity) => {
    // `unicodemath_field_value` returns `field.value` RAW for a generic
    // `Symbols::Symbol`, so the gem compares entity text against the entity
    // text in `primes_constants` — and the render of such a symbol is the
    // undecoded entity, matching no decoded glyph. Measured: all five are
    // primes to the gem. Checking only `&#x27;` caught one of them.
    const raw = new SymbolNode({ id: "Symbol", value: entity });
    expect(primeUnicode(raw)).toBe(true);
  });

  it.each(["Bar", "If", "Ul", "Paren::Lround", "Paren::Rsquare"])(
    "raises for %s, which has no unicodemath hexcode",
    (id) => {
      // `hexcode_in_input` returns nil for these, and the gem then calls
      // `.include?` on nil and RAISES — measured, 10 of 1,460 classes do.
      // Returning false instead rendered `x^(¯)` where the gem refuses.
      expect(() => primeUnicode(new SymbolNode({ id }))).toThrow(RenderError);
    },
  );

  it("is still false for a generic symbol with an unrelated value", () => {
    expect(primeUnicode(new SymbolNode({ id: "Symbol", value: "x" }))).toBe(false);
  });
});

describe("negatedValue matches the gem", () => {
  it("is true when the last child carries the combining long solidus", () => {
    const formula = new FormulaNode({
      value: [plainSymbol(), new SymbolNode({ id: "Symbol", value: "&#x338;" })],
    });
    expect(negatedValue(formula)).toBe(true);
  });

  it("is false when it ends in anything else", () => {
    expect(negatedValue(new FormulaNode({ value: [plainSymbol(), plainSymbol()] }))).toBe(false);
  });

  it("is false for a non-formula", () => {
    expect(negatedValue(plainSymbol())).toBe(false);
  });

  it("answers for an Mrow exactly as for a Formula", () => {
    // `Formula::Mrow < Formula` and overrides neither predicate — `mrow.rb`
    // defines zero of them. Measured on the oracle, an Mrow and a Formula with
    // the same children both answer true. Omitting `mrow` made every Mrow
    // answer false, which shows up as a join separator the gem suppresses.
    const children = [plainSymbol(), new SymbolNode({ id: "Symbol", value: "&#x338;" })];
    expect(negatedValue(new MrowNode({ value: children }))).toBe(true);
    expect(negatedValue(new FormulaNode({ value: children }))).toBe(true);
  });

  it("reports an Mrow as mini-sized when its first child is", () => {
    const children = [miniSymbol("sub"), plainSymbol()];
    expect(miniSized(new MrowNode({ value: children }))).toBe(true);
    expect(miniSized(new FormulaNode({ value: children }))).toBe(true);
  });

  it("looks at the raw value, not a symbol id", () => {
    // No entry in `src/generated/unicodemath/symbols.ts` carries U+0338: the
    // gem builds this as a generic `Symbols::Symbol` holding the entity text.
    // An implementation matching on a named id finds nothing and the predicate
    // silently never fires, which is what the first draft of this did.
    const byId = new FormulaNode({ value: [new SymbolNode({ id: "Nsub" })] });
    expect(negatedValue(byId)).toBe(false);
  });
});

/**
 * `Core#unicodemath_field_value` — RAW parse-input entity text.
 *
 * Every expectation here was measured on the pinned oracle, and each one is a
 * case the previous implementation got wrong. It had no generated parse-input
 * table, so it decoded the RENDER and looked that up, reasoning that the decode
 * is a bijection. Measured over `Overset(<class>, Acute)` across all 1,460
 * symbol classes, that proxy differed from the gem on 1,439 bare and 15 through
 * `Formula`, and `Underset` on 2; with the table, 0, 0 and 0.
 *
 * The cases below are the two shapes that survived `Formula`'s entity decode,
 * because those are the ones a caller could actually see through the public
 * API — the other 1,424 were invisible there and would not have failed a test
 * written at that level.
 */
describe("the unicodemath field value is entity text, not the render", () => {
  const acute = () => new SymbolNode({ id: "Acute" });
  const wrap = (node: OversetNode | UndersetNode) =>
    toUnicodemath(new FormulaNode({ value: [node] }));

  it("reads the parse-input entity for a symbol subclass", () => {
    // `Alpha` parses from `&#x3b1;` and renders `α`. The gem emits the former.
    expect(unicodemathFieldValue(new SymbolNode({ id: "Alpha" }))).toBe("&#x3b1;");
  });

  it("reads value RAW for the generic symbol, decoded or not", () => {
    // `class_name == "symbol"` takes the other arm, where the gem does no
    // lookup at all: whatever the node carries is the field value verbatim.
    expect(unicodemathFieldValue(new SymbolNode({ id: "Symbol", value: "&#x301;" }))).toBe(
      "&#x301;",
    );
    expect(unicodemathFieldValue(new SymbolNode({ id: "Symbol", value: "\u0301" }))).toBe("\u0301");
  });

  it("answers null for the ten classes with no entity entry", () => {
    // `hexcode_in_input` returns nil for these. Callers differ on what nil
    // means, so this must report it rather than substituting anything.
    for (const id of ["Bar", "If", "Ul", "Paren::Lround", "Paren::Rsquare"]) {
      expect(unicodemathFieldValue(new SymbolNode({ id }))).toBeNull();
    }
  });

  it("accents Hat and Tilde, which the render proxy could not", () => {
    // `Hat` renders `^` but parses from `&#x302;`, so the gem's accent tables
    // match it and the proxy's decoded `^` did not. Measured on the oracle:
    // `Formula(Overset(Hat, Acute))` is `(́)̂`; the proxy wrote `^́`.
    expect(
      wrap(new OversetNode({ parameterOne: new SymbolNode({ id: "Hat" }), parameterTwo: acute() })),
    ).toBe("(́)̂");
    expect(
      wrap(
        new UndersetNode({ parameterOne: new SymbolNode({ id: "Hat" }), parameterTwo: acute() }),
      ),
    ).toBe("(́)̂");
    expect(
      wrap(
        new UndersetNode({ parameterOne: new SymbolNode({ id: "Tilde" }), parameterTwo: acute() }),
      ),
    ).toBe("(́)̃");
  });

  it("interpolates a missing entity as empty, where the proxy wrote the render", () => {
    // The gem's `"#{unicodemath_field_value(parameter_one)}..."` on a nil is
    // `""`. The proxy emitted the rendered glyph instead — `¯` for `Bar`,
    // `if` for `If`. Measured on the oracle: both are `́` alone.
    expect(
      wrap(new OversetNode({ parameterOne: new SymbolNode({ id: "Bar" }), parameterTwo: acute() })),
    ).toBe("́");
    expect(
      wrap(new OversetNode({ parameterOne: new SymbolNode({ id: "If" }), parameterTwo: acute() })),
    ).toBe("́");
  });

  it("emits entity text when an overset is the render root", () => {
    // Without `Formula`'s decode pass nothing collapses the difference, which
    // is where 1,439 of the 1,460 classes diverged. `toUnicodemath` allows this
    // root, and the gem's own bare `Overset#to_unicodemath` measures it.
    expect(
      toUnicodemath(
        new OversetNode({ parameterOne: new SymbolNode({ id: "Aa" }), parameterTwo: acute() }),
      ),
    ).toBe("&#x2200;\u0301");
  });
});

/**
 * Slots where the gem raises and this port used to emit.
 *
 * Every one is the same root cause in a different disguise: a JS falsy or
 * shape test standing in for Ruby semantics that do not fail softly. `&.`
 * short-circuits on nil and NOTHING else, and `unless field` short-circuits on
 * nil and false and nothing else — so a String, an Array, or a node of the
 * wrong kind reaches the method call and raises.
 *
 * Each expectation below was measured on the pinned oracle before the fix, with
 * the port's old output recorded next to it. These are reachable through the
 * public model API, not hand-forged internal states.
 */
describe("slots the gem refuses are refused here too", () => {
  const S = (value: string) => new SymbolNode({ id: "Symbol", value });
  const mini = () => new NumberNode({ value: "1", miniSubSized: true });
  // The gem's option keys are snake_case Ruby symbols, not JS identifiers, so
  // they are built rather than written as literal property names.
  const gemOptions = (key: string, value: unknown): Record<string, unknown> => ({ [key]: value });

  it("refuses a nil element inside fenced contents", () => {
    // `param.to_unicodemath(options: options)` (`fenced.rb:107-111`) is
    // unguarded, unlike the `parameter_two&.map` on the line above it.
    //   gem  Fenced("(", [Symbol("x"), nil], ")")  !! NoMethodError
    //   port                                        => "(x )"
    expect(() =>
      toUnicodemath(
        new FencedNode({
          parameterOne: S("("),
          parameterTwo: [S("x"), null] as never,
          parameterThree: S(")"),
        }),
      ),
    ).toThrow(RenderError);
  });

  it("refuses a non-array contents slot on the mini-sized path", () => {
    // `parameter_two&.map` (`fenced.rb:183`) guards nil only; the port
    // substituted `[]` for anything non-array, swallowing the raise.
    //   gem  Fenced(Number(mini), "s", ")")  !! NoMethodError ('map' for String)
    //   port                                  => "&#x2081;)"
    expect(() =>
      toUnicodemath(
        new FencedNode({
          parameterOne: mini(),
          parameterTwo: "s" as never,
          parameterThree: S(")"),
        }),
      ),
    ).toThrow(RenderError);
  });

  it("refuses a nil element on the mini-sized path too", () => {
    //   gem  Fenced("(", [Number(mini), nil], ")")  !! NoMethodError
    //   port                                         => "(&#x2081;)"
    expect(() =>
      toUnicodemath(
        new FencedNode({
          parameterOne: S("("),
          parameterTwo: [mini(), null] as never,
          parameterThree: S(")"),
        }),
      ),
    ).toThrow(RenderError);
  });

  it("refuses a non-node paren slot even on the choose-frac early return", () => {
    // `parameter_one&.mini_sized?` (`fenced.rb:177`) raises for a String. This
    // is normally masked because the paren resolution throws a few lines later
    // — the LEADING choose-frac return skips that, so it was reachable.
    //   gem  Fenced("s", [Frac(n, k, choose: true)], ")")  !! NoMethodError
    //   port                                                => "(n)⒞(k)"
    expect(() =>
      toUnicodemath(
        new FencedNode({
          parameterOne: "s" as never,
          parameterTwo: [
            new FracNode({
              parameterOne: S("n"),
              parameterTwo: S("k"),
              options: { choose: true },
            } as never),
          ] as never,
          parameterThree: S(")"),
        }),
      ),
    ).toThrow(RenderError);
  });

  it("refuses a paren node that does not answer value", () => {
    // `parameter_one&.value&.include?(…)` (`fenced.rb:306`): the first `&.`
    // guards nil, so a node with no `value` field is sent the message.
    //   gem  Fenced(Abs(x), [x], ")", open_prefixed: true)  !! NoMethodError
    //   port                                                 => "├⒜(x)x)"
    expect(() =>
      toUnicodemath(
        new FencedNode({
          parameterOne: new AbsNode({ parameterOne: S("x") } as never),
          parameterTwo: [S("x")] as never,
          parameterThree: S(")"),
          options: gemOptions("open_prefixed", true),
        } as never),
      ),
    ).toThrow(RenderError);
  });

  it("still accepts a Formula paren, whose value is an Array", () => {
    // The boundary case that proves the check above is not simply "throw for
    // anything unusual": a Formula DOES answer `value`, `Array#include?` on a
    // needle string is false, and gem and port agree on the output.
    expect(() =>
      toUnicodemath(
        new FencedNode({
          parameterOne: new FormulaNode({ value: [S("x")] }),
          parameterTwo: [S("x")] as never,
          parameterThree: S(")"),
          options: gemOptions("open_prefixed", true),
        } as never),
      ),
    ).not.toThrow();
  });

  it("refuses a truthy non-node naryand, and accepts nil and false", () => {
    // `return "" unless field` is Ruby truthiness: nil and false short-circuit,
    // everything else is sent `to_unicodemath`.
    //   gem  Nary(∑, x, x, "s")  !! NoMethodError   port  => "&#x2211;_(x)^(x)"
    //   gem  Nary(∑, x, x, [])   !! NoMethodError   port  => "&#x2211;_(x)^(x)"
    //   gem  Nary(∑, x, x, nil)  => "&#x2211;_(x)^(x)"    both agree
    const nary = (parameterFour: unknown) =>
      new NaryNode({
        parameterOne: S("&#x2211;"),
        parameterTwo: S("x"),
        parameterThree: S("x"),
        parameterFour,
      } as never);

    expect(() => toUnicodemath(nary("s"))).toThrow(RenderError);
    expect(() => toUnicodemath(nary([]))).toThrow(RenderError);
    expect(toUnicodemath(nary(null))).toBe("&#x2211;_(x)^(x)");
    expect(toUnicodemath(nary(false))).toBe("&#x2211;_(x)^(x)");
  });
});

/**
 * Ruby's `Float#to_s` through an interpolated `mask`.
 *
 * The port refused EVERY non-integral number, on the stated grounds that
 * Ruby's `Float#to_s` cannot be derived from a JS number. That is true only
 * outside a band: Ruby prints plain shortest-round-trip decimal on
 * `[1e-4, 1e15)`, JS on the wider `[1e-6, 1e21)`, so Ruby-plain implies
 * JS-plain and the digits agree. Verified over 5,000 random non-integral values
 * inside the band: 5,000 agreements, 0 disagreements.
 *
 * Refusing there made the port emit nothing where the gem emits `1.5` — a
 * divergence pointing the opposite way from every other one in this file.
 */
describe("a float mask matches Ruby's Float#to_s inside the band", () => {
  const masked = (mask: unknown) =>
    toUnicodemath(
      new MpaddedNode({
        parameterOne: new SymbolNode({ id: "Symbol", value: "x" }),
        options: { mask },
      } as never),
    );

  it.each([
    [1.5, "⟡(1.5&x)"],
    [-0.75, "⟡(-0.75&x)"],
    [100.25, "⟡(100.25&x)"],
    // The lower edge of Ruby's plain range: one step below this it switches to
    // scientific and the two stop agreeing.
    [0.0001, "⟡(0.0001&x)"],
  ])("renders %s as the gem does", (mask, expected) => {
    expect(masked(mask)).toBe(expected);
  });

  it.each([
    [Number.NaN, "⟡(NaN&x)"],
    [Number.POSITIVE_INFINITY, "⟡(Infinity&x)"],
    [Number.NEGATIVE_INFINITY, "⟡(-Infinity&x)"],
  ])("renders %s, where both languages agree exactly", (mask, expected) => {
    expect(masked(mask)).toBe(expected);
  });

  it("still refuses a value outside the band rather than guessing", () => {
    // gem `1.5e-05`, JS `0.000015`. Reconstructing Ruby's scientific form is
    // 3,999-of-4,000 correct and therefore silently wrong once in a few
    // thousand — `1.2024716144439168e+15` is plain in Ruby while `1.5e15`, at
    // the same magnitude, is scientific. Refusing is the honest answer until
    // that rule is pinned.
    expect(() => masked(1.5e-5)).toThrow(RenderError);
  });

  it("renders an integral number as Ruby renders an Integer", () => {
    // The genuinely undecidable case: JS cannot tell `1` from `1.0`, and the
    // gem prints them differently. Pinned so the choice stays deliberate.
    expect(masked(1)).toBe("⟡(1&x)");
    expect(masked(5)).toBe("⟡(5&x)");
  });

  it("takes the Integer reading at the band's upper edge, where JS cannot decide", () => {
    // `1e15` is integral, so it never reaches the band check — a review read it
    // as an unhandled edge of the float fix, and a comment here wrongly listed
    // it as a REFUSED value. It is neither. Measured on the oracle, the gem's
    // answer depends on a Ruby type JS does not have:
    //
    //   mask 1e15 (Float)                "⟡(1.0e+15&x)"
    //   mask 1000000000000000 (Integer)  "⟡(1000000000000000&x)"
    //
    // so this is the same undecidable case as `1.0` -> `"1"`, resolved the same
    // way. Pinned here so the next reader sees the choice rather than re-deriving it.
    expect(masked(1e15)).toBe("⟡(1000000000000000&x)");
  });

  it("refuses a NON-integral value above the band, conservatively", () => {
    // Ruby's format is not decided by magnitude — `1.5e15` prints as "1.5e+15"
    // while `1202471614443916.8` at the same magnitude prints in full. Rather
    // than model that, the band stops at 1e15 and refuses above it, which can
    // refuse a value that would in fact have agreed. Loud beats silent.
    expect(() => masked(1000000000000000.5)).toThrow(RenderError);
  });
});

/**
 * The entity decode is NOT idempotent, and the port relies on running it in
 * exactly the places the gem does rather than on being able to run it twice.
 */
describe("the formula boundary decodes as often as the gem does", () => {
  const nested = (depth: number) => {
    let node: FormulaNode | SymbolNode = new SymbolNode({ id: "Symbol", value: "&amp;#x27;" });
    for (let i = 0; i < depth; i += 1) node = new FormulaNode({ value: [node] as never });
    return node as FormulaNode;
  };

  it.each([
    [1, "&#x27;"],
    [2, "'"],
    [3, "'"],
  ])("at depth %i gives the gem's answer", (depth, expected) => {
    // Measured on the oracle at each depth. Depth 1 leaves the entity undecoded
    // and depth 2 decodes it — which is only possible because the decode is
    // NOT idempotent, so moving it would change these answers.
    expect(toUnicodemath(nested(depth))).toBe(expected);
  });

  it("treats an Mrow layer as a Formula layer, as the gem does", () => {
    const wrapped = new FormulaNode({
      value: [new MrowNode({ value: [new SymbolNode({ id: "Symbol", value: "&amp;#x27;" })] })],
    });
    expect(toUnicodemath(wrapped)).toBe("'");
  });

  it("refuses a nil value with this format's own error", () => {
    // `Formula.new(nil)` raises in the gem (`negated_value?` calls `value.last`).
    // The port used to test `=== undefined`, which never fired for a `null`
    // value, and the nil fell through to `null.map` as a laundered TypeError.
    expect(() => toUnicodemath(new FormulaNode({ value: null } as never))).toThrow(RenderError);
  });
});
