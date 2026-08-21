/**
 * The Table subclasses, which the pinned corpus never reaches.
 *
 * Every table case in the corpus is a bare `Math::Function::Table`, so none of
 * the ten names in the renderer's measured set is exercised by parity — the
 * LaTeX side has corpus coverage for these and UnicodeMath does not. This file
 * is that coverage, measured directly against the pinned oracle (plurimath
 * 0.11.6, 00c52783) rather than derived from the renderer.
 *
 * The expectations come from the gem; the LIST OF NAMES comes from the
 * renderer. Both are needed and neither substitutes for the other: a
 * transcript copied out of the renderer would prove only that the renderer
 * agrees with itself, and a name list written out by hand here does the same
 * for coverage — which is what this file used to do, asserting its ten names
 * against a second copy of those ten names. `RENDERER_NAMES` below reads
 * `MEASURED_TABLE_NAMES` out of `src/render/table/unicodemath.ts`, so a name
 * added there without a row in `MEASURED` fails here (shown, by injecting one
 * into the real bytes), and `corpus/census.yaml` supplies the gem's own
 * subclass list to check that set against.
 *
 * The transcript was re-measured on the pinned oracle on 2026-08-20 — every
 * row below reproduced unchanged, and `Table.subclasses` there, with
 * `lib/plurimath/math/function/table/*.rb` loaded, is exactly these ten names.
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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RenderError } from "../../../src/core/errors";
import {
  BinaryFunctionNode,
  SymbolNode,
  TableNode,
  UnaryFunctionNode,
} from "../../../src/core/index";
import { toUnicodemath } from "../../../src/formats/unicodemath/renderer";
import { REPO_ROOT } from "../../core/corpus-pin";
import { readCensus } from "../../core/model-builder";

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

/**
 * What the renderer itself measures, read out of `MEASURED_TABLE_NAMES` in
 * `src/render/table/unicodemath.ts`.
 *
 * That set is module-private and stays that way — the renderer is not a test
 * fixture, and this lane may not edit it — so the names are recovered from the
 * declaration. A reading that goes wrong must never look like agreement, which
 * is what the two guards in the tests below are for: `measuredNamesIn` throws
 * when the declaration is not where it expects rather than returning nothing,
 * and it is exercised on the real bytes with a name injected, so the
 * comparison is shown to fail rather than assumed to.
 */
const RENDERER_SOURCE_PATH = join(REPO_ROOT, "src", "render", "table", "unicodemath.ts");

/** The whole declaration (group 2 is its body), and separately just its opening. */
const MEASURED_SET_DECLARATION = /(const MEASURED_TABLE_NAMES\b[^=]*=\s*new Set\(\[)([\s\S]*?)\]\)/;
const MEASURED_SET_OPENING = /(const MEASURED_TABLE_NAMES\b[^=]*=\s*new Set\(\[)/;

function measuredNamesIn(source: string): readonly string[] {
  const declaration = MEASURED_SET_DECLARATION.exec(source);
  if (declaration === null) {
    throw new Error(
      `no MEASURED_TABLE_NAMES Set literal in ${RENDERER_SOURCE_PATH}: this file can no longer ` +
        "see what the renderer measures, and that is a failure, not a pass.",
    );
  }
  const names: string[] = [];
  for (const quoted of (declaration[2] ?? "").matchAll(/"([^"]*)"/g)) {
    const name = quoted[1];
    if (name !== undefined && name.length > 0) names.push(name);
  }
  if (names.length === 0) {
    throw new Error(`MEASURED_TABLE_NAMES is empty in ${RENDERER_SOURCE_PATH}`);
  }
  return names;
}

/** `Math::Function::Table::Bmatrix` -> `Bmatrix`, the form both sets use. */
function classBasename(rubyClass: string): string {
  const parts = rubyClass.split("::");
  return parts[parts.length - 1] ?? rubyClass;
}

const RENDERER_SOURCE = readFileSync(RENDERER_SOURCE_PATH, "utf8");
const RENDERER_NAMES = measuredNamesIn(RENDERER_SOURCE);
const PINNED_NAMES = MEASURED.map(([name]) => name);

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

  it("pins every name the renderer measures, read out of the renderer", () => {
    // The assertion this replaced compared `MEASURED`'s names against a second
    // copy of the same ten names written here, so it could only fail if this
    // file disagreed with itself: a name added to the renderer left the file
    // green with that name unpinned. `RENDERER_NAMES` comes from the renderer.
    expect([...RENDERER_NAMES].sort()).toStrictEqual([...PINNED_NAMES].sort());
  });

  it("fails when the renderer gains a name this file does not pin", () => {
    // Demonstrated, not assumed: the same reader over the same bytes, with one
    // name inserted into the real declaration, no longer agrees with MEASURED.
    const gained = RENDERER_SOURCE.replace(MEASURED_SET_OPENING, '$1\n  "Smallmatrix",');
    expect(gained, "the injection anchor no longer matches the renderer").not.toBe(RENDERER_SOURCE);
    expect(measuredNamesIn(gained)).toContain("Smallmatrix");
    expect(() =>
      expect([...measuredNamesIn(gained)].sort()).toStrictEqual([...PINNED_NAMES].sort()),
    ).toThrow();
  });

  it("refuses to read a renderer whose declaration it cannot find", () => {
    // The other way this could go quiet: a rename or a move that makes the
    // reader find nothing. Finding nothing throws; it never reads as agreement.
    expect(() => measuredNamesIn('const OTHER: ReadonlySet<string> = new Set(["Align"]);')).toThrow(
      /no MEASURED_TABLE_NAMES/,
    );
    expect(() =>
      measuredNamesIn("const MEASURED_TABLE_NAMES: ReadonlySet<string> = new Set([]);"),
    ).toThrow(/is empty/);
  });

  it("reads the set the renderer's guard actually enforces", () => {
    // The read above is text. This is behaviour, and ties the two together:
    // every name read out of the declaration renders, and a name outside it is
    // refused by `unreachableName` rather than falling through to a default.
    for (const name of RENDERER_NAMES) {
      expect(() => toUnicodemath(table(name, "nil")), name).not.toThrow();
    }
    expect(() => toUnicodemath(table("Smallmatrix", "nil"))).toThrow(RenderError);
  });

  it("measures every Table subclass the gem has, and nothing else", () => {
    // The gem's side of the same set, from `corpus/census.yaml` (generated from
    // the gem): every class whose parent is `Math::Function::Table`. Measured
    // on the pinned oracle as well — with `lib/plurimath/math/function/table/
    // *.rb` loaded, `Table.subclasses` is exactly these ten (2026-08-20).
    const subclasses = readCensus()
      .classes.filter((entry) => entry.parent === "Math::Function::Table")
      .map((entry) => classBasename(entry.name))
      .sort();
    expect(subclasses.length).toBe(10);
    expect([...RENDERER_NAMES].sort()).toStrictEqual(subclasses);
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
