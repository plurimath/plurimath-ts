/**
 * `equals` against the gem.
 *
 * Every expectation here was read off the Ruby gem at plurimath-oracle
 * `00c52783` (v0.11.6) rather than reasoned about — each pair was run through
 * `==` there first, including the ones whose answer is counter-intuitive (a
 * Formula equals an Mrow; a nil field does not equal a false one; a symbol
 * with no value equals one carrying the character its class renders to).
 *
 * The file tests the module function. `node.equals(other)`, the same
 * projection reached as a method, is covered in `nodes.spec.ts`.
 */

import { describe, expect, it } from "vitest";
import { equals } from "../../src/core/equality";
import {
  AbsNode,
  BinaryFunctionNode,
  FontStyleNode,
  FormulaNode,
  FracNode,
  type MathNode,
  MrowNode,
  NumberNode,
  SymbolNode,
  TableNode,
  TextNode,
  UnaryFunctionNode,
} from "../../src/core/nodes";
import { aliasIndex, buildNode, readCensus, readCorpusCases } from "./model-builder";

const x = () => new SymbolNode({ value: "x" });

describe("fields Ruby's `==` skips", () => {
  it("ignores Formula's input_string, displaystyle and display", () => {
    const left = new FormulaNode({
      value: [x()],
      leftRightWrapper: true,
      inputString: "x",
      displaystyle: true,
    });
    const right = new FormulaNode({
      value: [x()],
      leftRightWrapper: true,
      inputString: "DIFFERENT",
      displaystyle: false,
      display: "block",
    });
    expect(equals(left, right)).toBe(true);
    expect(equals(right, left)).toBe(true);
  });

  it("ignores Text's lang", () => {
    const left = new TextNode({ parameterOne: "hi", lang: "en" });
    const right = new TextNode({ parameterOne: "hi", lang: "fr" });
    expect(equals(left, right)).toBe(true);
  });

  it("ignores Abs's parens", () => {
    const left = new AbsNode({ parameterOne: x() });
    const right = new AbsNode({
      parameterOne: x(),
      openParen: new SymbolNode({ id: "Paren::Lround" }),
    });
    expect(equals(left, right)).toBe(true);
  });

  it("still separates nodes that differ in a compared field", () => {
    expect(equals(new TextNode({ parameterOne: "hi" }), new TextNode({ parameterOne: "ho" }))).toBe(
      false,
    );
    expect(equals(new FracNode({ options: { a: 1 } }), new FracNode({ options: { a: 2 } }))).toBe(
      false,
    );
    expect(equals(new FracNode({ options: { a: 1 } }), new FracNode({ options: { a: 1 } }))).toBe(
      true,
    );
  });
});

describe("class identity", () => {
  it("treats a Formula and an Mrow with the same value as equal (Ruby duck-types it)", () => {
    const formula = new FormulaNode({ value: [x()], leftRightWrapper: true });
    const mrow = new MrowNode({ value: [x()], leftRightWrapper: true });
    expect(equals(formula, mrow)).toBe(true);
    expect(equals(mrow, formula)).toBe(true);
  });

  it("treats a Formula and its Mstyle alias as equal", () => {
    const formula = new FormulaNode({ value: [x()], leftRightWrapper: true });
    const mstyle = new FormulaNode({ name: "Mstyle", value: [x()], leftRightWrapper: true });
    expect(equals(formula, mstyle)).toBe(true);
  });

  it("separates two aliases of the same carrier", () => {
    const sin = new UnaryFunctionNode({ name: "Sin", parameterOne: x() });
    const cos = new UnaryFunctionNode({ name: "Cos", parameterOne: x() });
    expect(equals(sin, cos)).toBe(false);
    expect(equals(sin, new UnaryFunctionNode({ name: "Sin", parameterOne: x() }))).toBe(true);
  });

  it("separates two symbol classes and two table classes", () => {
    expect(equals(new SymbolNode({ id: "Plus" }), new SymbolNode({ id: "Minus" }))).toBe(false);
    expect(equals(new SymbolNode({ id: "Plus" }), new SymbolNode({ id: "Plus" }))).toBe(true);
    expect(equals(new TableNode({ value: [] }), new TableNode({ name: "Matrix", value: [] }))).toBe(
      false,
    );
  });

  it("separates different kinds, and anything that is not a node", () => {
    expect(equals(new NumberNode({ value: "2" }), new SymbolNode({ value: "2" }))).toBe(false);
    expect(equals(new FormulaNode({ value: [] }), new TableNode({ value: [] }))).toBe(false);
    expect(equals(x(), "x")).toBe(false);
    expect(equals(x(), null)).toBe(false);
  });

  it("does not care which carrier arity a generic function came from", () => {
    // `Power` is a BinaryFunction alias; a UnaryFunction called "Power" is a
    // different Ruby class and must not compare equal.
    const binary = new BinaryFunctionNode({ name: "Power", parameterOne: x() });
    const unary = new UnaryFunctionNode({ name: "Power", parameterOne: x() });
    expect(equals(binary, unary)).toBe(false);
  });
});

describe("nil handling", () => {
  it("treats an unset field and an explicit nil as the same", () => {
    // An instance variable Ruby never assigned reads back as nil, so `==`
    // cannot tell them apart.
    expect(equals(new FracNode(), new FracNode({ parameterOne: null }))).toBe(true);
  });

  it("does not treat nil as false", () => {
    // `Number` cannot show this: its constructor assigns `mini_sub_sized`
    // unconditionally, so both sides would be `false`. `Symbol` guards the
    // assignment (`@mini_sub_sized = mini_sub_sized if mini_sub_sized`), so a
    // bare symbol leaves it unset while an explicit `false` records it —
    // exactly Ruby's `nil` vs `false`, which `==` reports as unequal:
    //
    //   a = Plus.new("+"); a.mini_sub_sized = false
    //   a == Plus.new("+")   # => false
    const set = new SymbolNode({ id: "Plus", value: "+", miniSubSized: false });
    const unset = new SymbolNode({ id: "Plus", value: "+" });
    expect(equals(set, unset)).toBe(false);
  });

  it("treats two same-class symbols with nil values as equal", () => {
    expect(
      equals(new SymbolNode({ id: "Plus" }), new SymbolNode({ id: "Plus", value: null })),
    ).toBe(true);
  });

  it("decodes numeric entities before comparing symbol values", () => {
    expect(equals(new SymbolNode({ value: "&#x3c0;" }), new SymbolNode({ value: "π" }))).toBe(true);
    expect(equals(new SymbolNode({ value: "&#960;" }), new SymbolNode({ value: "π" }))).toBe(true);
    expect(equals(new SymbolNode({ value: "&#x3c0;" }), new SymbolNode({ value: "x" }))).toBe(
      false,
    );
  });
});

/**
 * `comparable_value`: the projection `Symbols::Symbol#==` actually compares.
 *
 * ```ruby
 * def comparable_value(symbol)
 *   normalize_value(symbol.value || symbol.send(:default_value_for_comparison))
 * end
 * ```
 *
 * So a symbol with no value of its own compares by what its class renders to,
 * and both sides are HTML-entity-decoded first. Every expectation below is the
 * gem's answer, run at plurimath-oracle `00c52783` (v0.11.6) — all 30 pairs of
 * this file's fixture agreed with the gem when the two were run side by side,
 * as did all 11,653 comparisons of a sweep over the whole symbol hierarchy.
 *
 * The nil cases are asserted in both spellings of "no value" — field unset and
 * field explicitly `null` — because the answer must not depend on which one
 * the constructor happens to store.
 */
describe("comparable_value: the canonical fallback", () => {
  it('treats Plus(nil) and Plus("+") as equal', () => {
    expect(equals(new SymbolNode({ id: "Plus" }), new SymbolNode({ id: "Plus", value: "+" }))).toBe(
      true,
    );
    expect(
      equals(
        new SymbolNode({ id: "Plus", value: null }),
        new SymbolNode({ id: "Plus", value: "+" }),
      ),
    ).toBe(true);
  });

  it('treats Pi(nil) and Pi("&#x3c0;") as equal', () => {
    expect(
      equals(new SymbolNode({ id: "Pi" }), new SymbolNode({ id: "Pi", value: "&#x3c0;" })),
    ).toBe(true);
    expect(
      equals(
        new SymbolNode({ id: "Pi", value: null }),
        new SymbolNode({ id: "Pi", value: "&#x3c0;" }),
      ),
    ).toBe(true);
  });

  it("resolves the fallback lazily, leaving the node's own value nil", () => {
    // The trap this replaces: materializing the canonical value in the
    // constructor would make `normalize` emit a value where Ruby emits nil.
    expect(new SymbolNode({ id: "Plus" }).value).toBeNull();
  });

  it("keeps two classes that share a canonical character apart", () => {
    // Both render "(" — Ruby's `object.class == self.class` still separates
    // them, and `id` is that check here.
    expect(equals(new SymbolNode({ id: "Lparen" }), new SymbolNode({ id: "Paren::Lround" }))).toBe(
      false,
    );
  });

  it("gives the base Symbol class no fallback at all", () => {
    // `default_value_for_comparison` starts `return if instance_of?(Symbol)`.
    expect(equals(new SymbolNode(), new SymbolNode({ value: "x" }))).toBe(false);
    expect(equals(new SymbolNode(), new SymbolNode())).toBe(true);
  });

  it("uses an empty value rather than the fallback, as Ruby's `||` does", () => {
    // "" is truthy in Ruby, so `value || fallback` keeps it.
    expect(equals(new SymbolNode({ id: "Plus" }), new SymbolNode({ id: "Plus", value: "" }))).toBe(
      false,
    );
  });

  it("still separates symbols that differ in a field outside the value", () => {
    expect(
      equals(
        new SymbolNode({ id: "Plus", miniSubSized: true }),
        new SymbolNode({ id: "Plus", value: "+" }),
      ),
    ).toBe(false);
  });
});

/**
 * Entity decoding, against the gem's own decoder (`HTMLEntities` at its
 * default `xhtml1` flavour, 253 named entities).
 *
 * The cases that matter are the ones a differently-sized table would get
 * wrong: `&half;` and `&sung;` are HTML5 entities that `he` and `entities`
 * decode and the gem does not, and `&PI;` is the case-insensitive match whose
 * verbatim lookup fails.
 */
describe("comparable_value: entity decoding", () => {
  const pi = (value: string) => new SymbolNode({ id: "Pi", value });
  const generic = (value: string) => new SymbolNode({ value });

  it("decodes the named entities the gem decodes", () => {
    expect(equals(pi("&pi;"), pi("π"))).toBe(true);
    expect(equals(pi("&Pi;"), pi("Π"))).toBe(true);
    expect(equals(generic("&frac12;"), generic("½"))).toBe(true);
    expect(equals(generic("&amp;"), generic("&"))).toBe(true);
    expect(
      equals(new SymbolNode({ id: "Times", value: "&times;" }), new SymbolNode({ id: "Times" })),
    ).toBe(true);
  });

  it("leaves the HTML5-only entities alone, exactly as the gem does", () => {
    // A JavaScript entity library would decode both of these and report equal.
    expect(equals(generic("&half;"), generic("½"))).toBe(false);
    expect(equals(generic("&sung;"), generic("♪"))).toBe(false);
  });

  it("looks a name up verbatim, though it matches case-insensitively", () => {
    expect(equals(pi("&PI;"), pi("Π"))).toBe(false);
    expect(equals(generic("&AMP;"), generic("&"))).toBe(false);
  });

  it("decodes numeric references within the gem's digit limits", () => {
    expect(equals(pi("&#960;"), pi("π"))).toBe(true);
    expect(equals(pi("&#x3c0;"), pi("π"))).toBe(true);
    expect(equals(pi("&#X3C0;"), pi("π"))).toBe(true);
    expect(equals(pi("&#x0003c0;"), pi("π"))).toBe(true);
    // Seven hex digits is one past `[0-9a-f]{1,6}`, so nothing is decoded.
    expect(equals(pi("&#x00003c0;"), pi("π"))).toBe(false);
    expect(equals(pi("&#00000960;"), pi("π"))).toBe(false);
  });

  it("accepts the gem's non-semicolon terminators", () => {
    // `(;|(?=\n|<))`: a newline or `<` ends an entity without being consumed.
    expect(equals(generic("&pi<"), generic("π<"))).toBe(true);
    expect(equals(generic("&pi"), generic("π"))).toBe(false);
    expect(equals(generic("&pi;;"), generic("π;"))).toBe(true);
  });

  it("leaves an unknown entity as written", () => {
    expect(equals(generic("&nosuch;"), generic("&nosuch;"))).toBe(true);
    expect(equals(generic("&nosuch;"), generic("x"))).toBe(false);
  });

  it("raises on a codepoint the gem cannot encode, exactly as the gem does", () => {
    // `chr(Encoding::UTF_8)` raises inside the gem's decoder and the gem lets
    // it out of `==`; being more forgiving than the oracle would be a
    // divergence, not a nicety. Run at plurimath-oracle `00c52783`:
    //
    //   Symbol.new("&#xD800;")   == itself  # RangeError: invalid codepoint 0xD800 in UTF-8
    //   Symbol.new("&#1234567;") == itself  # RangeError: 1234567 out of char range
    //
    // Native `RangeError`, not a `PlurimathError`: the package codes describe
    // package operations, and this is JavaScript's own failure.
    expect(() => equals(generic("&#xD800;"), generic("&#xD800;"))).toThrow(RangeError);
    expect(() => equals(generic("&#1234567;"), generic("&#1234567;"))).toThrow(RangeError);
    // The whole surrogate block and everything past U+10FFFF, both spellings.
    expect(() => equals(generic("&#xDFFF;"), generic("x"))).toThrow(RangeError);
    expect(() => equals(generic("&#55296;"), generic("x"))).toThrow(RangeError);
    expect(() => equals(generic("&#x110000;"), generic("x"))).toThrow(RangeError);
    expect(() => equals(generic("&#9999999;"), generic("x"))).toThrow(RangeError);
  });

  it("still decodes the boundaries the gem decodes", () => {
    // U+10FFFF, U+0000 and the codepoints either side of the surrogate block
    // all answer in the gem rather than raising, so they must answer here.
    expect(equals(generic("&#x10FFFF;"), generic("&#x10FFFF;"))).toBe(true);
    expect(equals(generic("&#x0;"), generic("&#x0;"))).toBe(true);
    expect(equals(generic("&#xD7FF;"), generic("&#xD7FF;"))).toBe(true);
    expect(equals(generic("&#xE000;"), generic("&#xE000;"))).toBe(true);
  });
});

describe("font family folding", () => {
  it("folds an alias to the FontStyle class it names, as Ruby does", () => {
    const bold = new FontStyleNode({ parameterOne: x(), parameterTwo: "bf" });
    expect(equals(bold, new FontStyleNode({ parameterOne: x(), parameterTwo: "mathbf" }))).toBe(
      true,
    );
    expect(equals(bold, new FontStyleNode({ parameterOne: x(), parameterTwo: "sf" }))).toBe(false);
  });

  it("keeps an unmapped family distinct from the class an alias folds to", () => {
    const folded = new FontStyleNode({ parameterOne: x(), parameterTwo: "bf" });
    const raw = new FontStyleNode({ parameterOne: x(), parameterTwo: "Bold" });
    expect(equals(folded, raw)).toBe(false);
  });

  it("separates a FontStyle subclass from the base class", () => {
    const base = new FontStyleNode({ parameterOne: x(), parameterTwo: "bf" });
    const subclass = new FontStyleNode({ name: "Bold", parameterOne: x(), parameterTwo: "bf" });
    expect(equals(base, subclass)).toBe(false);
  });
});

describe("deep structure", () => {
  it("compares nested nodes and node lists structurally", () => {
    const left = new FormulaNode({
      value: [new FracNode({ parameterOne: x(), parameterTwo: new NumberNode({ value: "2" }) })],
      leftRightWrapper: true,
    });
    const right = new FormulaNode({
      value: [new FracNode({ parameterOne: x(), parameterTwo: new NumberNode({ value: "2" }) })],
      leftRightWrapper: true,
    });
    expect(equals(left, right)).toBe(true);

    const different = new FormulaNode({
      value: [new FracNode({ parameterOne: x(), parameterTwo: new NumberNode({ value: "3" }) })],
      leftRightWrapper: true,
    });
    expect(equals(left, different)).toBe(false);
  });

  it("compares list length, not just contents", () => {
    const one = new FormulaNode({ value: [x()], leftRightWrapper: true });
    const two = new FormulaNode({ value: [x(), x()], leftRightWrapper: true });
    expect(equals(one, two)).toBe(false);
  });
});

/**
 * The strongest available Ruby-derived fixture: the gem was asked, for all
 * 90 corpus formulas, which pairs satisfy `==`. Exactly three distinct pairs
 * do, and each differs only in `input_string` — a field the projection skips.
 * Everything else is unequal, and every case equals itself.
 */
describe("the corpus equality matrix, as the gem reports it", () => {
  const cases = readCorpusCases();
  const aliases = aliasIndex(readCensus());
  const nodes: readonly (readonly [string, MathNode])[] = cases.map((entry) => [
    entry.id,
    buildNode(entry.model, aliases),
  ]);

  const RubyEqualPairs: ReadonlySet<string> = new Set([
    "frac-simple|frac-explicit",
    "operator-plus|whitespace-around-operator",
    "symbol-latin-x|whitespace-surrounding",
  ]);

  it("has the 91 cases it expects", () => {
    expect(nodes).toHaveLength(91);
  });

  it("is reflexive: a rebuilt tree equals its twin", () => {
    for (const [id, node] of nodes) {
      expect(
        equals(node, buildNode(cases.find((c) => c.id === id)?.model as never, aliases)),
        id,
      ).toBe(true);
    }
  });

  it("matches the gem pair for pair", () => {
    const found: string[] = [];
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const [leftId, left] = nodes[i] as readonly [string, MathNode];
        const [rightId, right] = nodes[j] as readonly [string, MathNode];
        const result = equals(left, right);
        expect(equals(right, left), `${leftId} vs ${rightId} is asymmetric`).toBe(result);
        if (result) found.push(`${leftId}|${rightId}`);
      }
    }
    expect([...found].sort()).toStrictEqual([...RubyEqualPairs].sort());
  });

  it("proves those three differ only in a field the projection skips", () => {
    for (const pair of RubyEqualPairs) {
      const [leftId, rightId] = pair.split("|");
      const left = cases.find((entry) => entry.id === leftId)?.model;
      const right = cases.find((entry) => entry.id === rightId)?.model;
      expect(left?.fields.input_string, pair).not.toStrictEqual(right?.fields.input_string);
    }
  });
});
