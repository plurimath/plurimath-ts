/**
 * The Table subclasses, which the pinned corpus never reaches.
 *
 * Every table case in the corpus is a bare `Math::Function::Table`, so none of
 * the ten names in the renderer's measured set is exercised by parity — the
 * LaTeX side has corpus coverage for these and UnicodeMath does not. This file
 * is that coverage, measured directly against the pinned oracle (plurimath
 * 0.11.6, 00c52783) rather than derived from the renderer.
 *
 * The measured transcript. `Klass.new(rows, open, close).to_unicodemath` with
 * `rows` two rows of two cells, across three paren axes — parens OMITTED (so
 * the gem's own constructor defaults apply), parens explicitly nil, and an
 * explicit `[`/`]` pair:
 *
 *   name      omitted          nil,nil        [ and ]
 *   Align     [■(a&b@c&d)]     ■(a&b@c&d)     [■(a&b@c&d)]
 *   Array     [■(a&b@c&d)]     ■(a&b@c&d)     [■(a&b@c&d)]
 *   Bmatrix   ⓢ(a&b@c&d)      ⓢ(a&b@c&d)    ⓢ(a&b@c&d)
 *   Cases     Ⓒ(a&b@c&d)      Ⓒ(a&b@c&d)    Ⓒ(a&b@c&d)
 *   Eqarray   █(a&b@c&d)       █(a&b@c&d)     [█(a&b@c&d)]
 *   Matrix    (■(a&b@c&d))     ■(a&b@c&d)     [■(a&b@c&d)]
 *   Multline  [■(a&b@c&d)]     ■(a&b@c&d)     [■(a&b@c&d)]
 *   Pmatrix   ⒨(a&b@c&d)      ⒨(a&b@c&d)    ⒨(a&b@c&d)
 *   Split     [■(a&b@c&d)]     ■(a&b@c&d)     [■(a&b@c&d)]
 *   Vmatrix   ⒱(a&b@c&d)      ⒱(a&b@c&d)    ⒱(a&b@c&d)
 *
 * Three behaviours fall out, none guessable from the class list:
 *
 *  1. **The omitted column is not the nil column.** Each subclass constructor
 *     supplies its own default parens — `Lsquare` for Align/Array/Multline/
 *     Split, `Lround` for Matrix, nil for Eqarray — so `Matrix` renders
 *     `(■…)` when you pass nothing and `■…` when you pass nil. The port
 *     mirrors this through the node aliases; an earlier draft of this file
 *     compared the port's omitted form against the gem's nil form and
 *     reported a defect that was not there.
 *  2. **Four subclasses ignore their parens entirely.** Bmatrix, Cases,
 *     Pmatrix and Vmatrix write their marker and stop, so brackets in the
 *     output are a property of the SUBCLASS, not of the parens given.
 *  3. **`Matrix` is not special.** It renders `■`, the same marker the
 *     inherited path uses, where Pmatrix and Vmatrix have their own. A reading
 *     that assumes every `*matrix` name carries a distinct marker gets it
 *     wrong.
 *
 * Cell and row separators are `&` and `@`, owned by `Tr#to_unicodemath` and
 * `Td#to_unicodemath`, not by this renderer.
 */

import { describe, expect, it } from "vitest";
import {
  BinaryFunctionNode,
  SymbolNode,
  TableNode,
  UnaryFunctionNode,
} from "../../../src/core/index";
import { toUnicodemath } from "../../../src/formats/unicodemath/renderer";

// `Td` and `Tr` have no node classes of their own: the census folds them onto
// the binary and unary carriers, so they are carrier nodes carrying the Ruby
// class basename. Same construction the latex renderer spec uses.
const sym = (text: string) => new SymbolNode({ id: "Symbol", value: text });
const td = (text: string) => new BinaryFunctionNode({ name: "Td", parameterOne: [sym(text)] });
const tr = (...cells: readonly string[]) =>
  new UnaryFunctionNode({ name: "Tr", parameterOne: cells.map((text) => td(text)) });
const rows = () => [tr("a", "b"), tr("c", "d")];

const lsquare = () => new SymbolNode({ id: "Paren::Lsquare", value: "[" });
const rsquare = () => new SymbolNode({ id: "Paren::Rsquare", value: "]" });

type ParenMode = "omitted" | "nil" | "squares";

function table(name: string, mode: ParenMode) {
  // `undefined` means "not given", which lets the node's alias defaults stand
  // in for the gem's constructor defaults; `null` is an explicitly nil paren.
  const open = mode === "omitted" ? undefined : mode === "nil" ? null : lsquare();
  const close = mode === "omitted" ? undefined : mode === "nil" ? null : rsquare();
  return new TableNode({
    name,
    value: rows() as never,
    openParen: open as never,
    closeParen: close as never,
  });
}

/** [name, parens omitted, parens explicitly nil, explicit [ and ]] — measured. */
const MEASURED: ReadonlyArray<readonly [string, string, string, string]> = [
  ["Align", "[■(a&b@c&d)]", "■(a&b@c&d)", "[■(a&b@c&d)]"],
  ["Array", "[■(a&b@c&d)]", "■(a&b@c&d)", "[■(a&b@c&d)]"],
  ["Bmatrix", "ⓢ(a&b@c&d)", "ⓢ(a&b@c&d)", "ⓢ(a&b@c&d)"],
  ["Cases", "Ⓒ(a&b@c&d)", "Ⓒ(a&b@c&d)", "Ⓒ(a&b@c&d)"],
  ["Eqarray", "█(a&b@c&d)", "█(a&b@c&d)", "[█(a&b@c&d)]"],
  ["Matrix", "(■(a&b@c&d))", "■(a&b@c&d)", "[■(a&b@c&d)]"],
  ["Multline", "[■(a&b@c&d)]", "■(a&b@c&d)", "[■(a&b@c&d)]"],
  ["Pmatrix", "⒨(a&b@c&d)", "⒨(a&b@c&d)", "⒨(a&b@c&d)"],
  ["Split", "[■(a&b@c&d)]", "■(a&b@c&d)", "[■(a&b@c&d)]"],
  ["Vmatrix", "⒱(a&b@c&d)", "⒱(a&b@c&d)", "⒱(a&b@c&d)"],
];

describe("every Table subclass renders what the gem renders", () => {
  it.each(MEASURED)("%s, parens omitted (constructor defaults apply)", (name, omitted) => {
    expect(toUnicodemath(table(name, "omitted"))).toBe(omitted);
  });

  it.each(MEASURED)("%s, parens explicitly nil", (name, _omitted, nils) => {
    expect(toUnicodemath(table(name, "nil"))).toBe(nils);
  });

  it.each(MEASURED)("%s, an explicit [ and ] pair", (name, _omitted, _nils, squares) => {
    expect(toUnicodemath(table(name, "squares"))).toBe(squares);
  });

  it("covers every name the renderer claims to have measured", () => {
    // A list that silently shrank would leave a subclass unpinned while this
    // file still looked like coverage.
    expect(MEASURED.map(([name]) => name).sort()).toStrictEqual([
      "Align",
      "Array",
      "Bmatrix",
      "Cases",
      "Eqarray",
      "Matrix",
      "Multline",
      "Pmatrix",
      "Split",
      "Vmatrix",
    ]);
  });

  it("separates the paren-blind subclasses from the wrapping ones", () => {
    // Asserted as a property so a uniform implementation cannot pass: exactly
    // four names render identically however the parens are given.
    const parenBlind = MEASURED.filter(
      ([, omitted, nils, squares]) => omitted === nils && nils === squares,
    ).map(([name]) => name);
    expect(parenBlind).toStrictEqual(["Bmatrix", "Cases", "Pmatrix", "Vmatrix"]);
  });

  it("proves the omitted and nil columns genuinely differ", () => {
    // If the port ignored the constructor defaults, these two columns would be
    // identical everywhere and the first axis would prove nothing.
    const differs = MEASURED.filter(([, omitted, nils]) => omitted !== nils).map(([name]) => name);
    expect(differs).toStrictEqual(["Align", "Array", "Matrix", "Multline", "Split"]);
  });
});
