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
import { FencedNode, FormulaNode, FracNode, NumberNode, SymbolNode } from "../../../src/core/index";
import {
  miniSized,
  negatedValue,
  primeUnicode,
} from "../../../src/formats/unicodemath/render-shared";

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
const PRIME: ReadonlyArray<readonly [string, string, boolean]> = [
  ["Prime", "′", true],
  ["Dprime", "″", true],
  ["Second", "″", true],
  ["Third", "‴", true],
  ["Qprime", "⁗", true],
  ["the bare apostrophe", "'", true],
  ["Sum", "∑", false],
  ["Alpha", "α", false],
];

describe("primeUnicode matches the gem", () => {
  it.each(PRIME)("%s", (_name, rendered, expected) => {
    expect(primeUnicode(new SymbolNode({ id: "Symbol" }), rendered)).toBe(expected);
  });

  it("is false for a formula, however many primes it holds", () => {
    // The gem's first line is `return false unless field.is_a?(Symbols::Symbol)`,
    // so a formula wrapping a prime never triggers the swap. Measured: false.
    expect(primeUnicode(new FormulaNode({ value: [plainSymbol()] }), "′")).toBe(false);
  });

  it("is false when the child rendered to nothing", () => {
    expect(primeUnicode(new SymbolNode({ id: "Symbol" }), null)).toBe(false);
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

  it("looks at the raw value, not a symbol id", () => {
    // No entry in `src/generated/unicodemath/symbols.ts` carries U+0338: the
    // gem builds this as a generic `Symbols::Symbol` holding the entity text.
    // An implementation matching on a named id finds nothing and the predicate
    // silently never fires, which is what the first draft of this did.
    const byId = new FormulaNode({ value: [new SymbolNode({ id: "Nsub" })] });
    expect(negatedValue(byId)).toBe(false);
  });
});
