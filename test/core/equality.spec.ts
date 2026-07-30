/**
 * `equals` against the gem.
 *
 * Every expectation in the first two blocks was read off the Ruby gem at
 * plurimath-oracle `00c52783` (v0.11.6) rather than reasoned about — the
 * pairs below were run through `==` there first, including the ones whose
 * answer is counter-intuitive (a Formula equals an Mrow; a nil field does not
 * equal a false one).
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
    const set = new NumberNode({ value: "2", miniSubSized: false });
    const unset = new NumberNode({ value: "2" });
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
 * 69 corpus formulas, which pairs satisfy `==`. Exactly three distinct pairs
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

  it("has the 69 cases it expects", () => {
    expect(nodes).toHaveLength(69);
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
