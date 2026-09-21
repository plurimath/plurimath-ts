/**
 * Oracle-backed parity for `toMathml(node, { intent: true })` (roadmap B4).
 *
 * The rows are the `intent*` groups of `render-options-fixtures.json`, which
 * the generator writes from the pinned gem (plurimath 0.11.6, 00c52783):
 *   ruby scripts/generate-render-options-fixtures.rb --oracle <clean checkout>
 *
 * Where the cases come from, so a reader can tell what this proves:
 *
 *   - `intent-spec`: the 8 static examples of the gem's own
 *     `spec/plurimath/math/formula/intent_encoding_spec.rb` (prod, sum, cos,
 *     oiiint, oiint, inf, lim, log), rendered as the spec renders them. The
 *     spec's unicodemath-templated example reads `submodules/unicodemath-tests`,
 *     which this checkout does not carry, so it is not here.
 *   - `intent-unicodemath-spec` and `-off`: the 12 `ⓘ` examples of
 *     `unicode_math_parse_values.rb`, as the gem's parse recorded as a model —
 *     the port's UnicodeMath grammar does not parse `ⓘ` yet — rendered with the
 *     intent option and, for `-off`, without it (`Function::Intent` and
 *     `Function::Arg` write their attributes either way).
 *   - `intent-nary`, `-function`, `-abs`, `-fenced`, `-frac`,
 *     `-partial-derivative`, `-derivative-subsup`, `-symbol`, `-table`:
 *     measured probes, one group per behaviour of the gem's pipeline.
 *   - `intent-class`: hand-built trees for the classes no parse reaches — each
 *     of the 13 n-ary symbols through `Nary`, the five symbols with their own
 *     intent write (alone, first, and after a variable), and wrapped nested
 *     formulas for `intent_attribute`.
 *   - `intent-off`: `intent: false`, `intent: nil` and the omitted keyword, which
 *     the gem renders byte-identically.
 *
 * Every row is asserted: bytes where the gem renders, a `RenderError` where it
 * refused. A row the port cannot yet reproduce is named in `PORT_REFUSES`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type MathNode, RenderError } from "../../../src/core/index";
import { normalize } from "../../../src/core/normalize";
import { parseAsciimath } from "../../../src/formats/asciimath/index";
import { parseLatex } from "../../../src/formats/latex/index";
import { toMathml } from "../../../src/formats/mathml/renderer";
import { parseUnicodemath } from "../../../src/formats/unicodemath/index";
import { aliasIndex, buildNode, readCensus, type SerializedNode } from "../../core/model-builder";

interface Row {
  readonly id: string;
  readonly group: string;
  readonly source: string;
  readonly input: {
    readonly model?: SerializedNode;
    readonly format?: string;
    readonly text?: string;
  };
  readonly options: Readonly<Record<string, unknown>>;
  readonly expected?: string;
  readonly raises?: string;
  readonly raisedIn?: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ALIASES = aliasIndex(readCensus());

const fixture = JSON.parse(readFileSync(join(HERE, "render-options-fixtures.json"), "utf8")) as {
  readonly cases: readonly Row[];
};
const rows = fixture.cases.filter((row) => row.group.startsWith("intent"));
const rendered = rows.filter((row) => row.expected !== undefined);
const refused = rows.filter((row) => row.raises !== undefined);

/**
 * Rows the gem renders that this port refuses, by id, each with the reason.
 * Both are `Function::Arg` (ⓐ), which the gem writes an `arg` attribute for
 * whatever the intent option says; it is not intent-bearing, and its symbol-
 * keyed `attributes[:arg]` write is not something `XmlElement` models, so the
 * mathml carrier does not name it (`unreachableName`) and the rows are pinned
 * as that refusal. An entry that starts rendering fails its test until dropped.
 */
const PORT_REFUSES: Readonly<Record<string, string>> = {
  "intent-unicodemath-528": 'binaryFunction name "Arg"',
  "intent-unicodemath-528-off": 'binaryFunction name "Arg"',
  "intent-unicodemath-536": 'binaryFunction name "Arg"',
  "intent-unicodemath-536-off": 'binaryFunction name "Arg"',
};

function build(row: Row): MathNode {
  if (row.input.model !== undefined) return buildNode(row.input.model, ALIASES);
  const text = row.input.text as string;
  switch (row.input.format) {
    case "asciimath":
      return parseAsciimath(text);
    case "latex":
      return parseLatex(text);
    case "unicodemath":
      return parseUnicodemath(text);
    default:
      throw new Error(`${row.id}: unknown input format ${row.input.format}`);
  }
}

function render(row: Row): string {
  return toMathml(build(row), { ...row.options } as never);
}

describe("the intent rows", () => {
  it("are all present, by group, and counted", () => {
    const groups = new Set(rows.map((row) => row.group));
    expect([...groups].sort()).toEqual(
      [
        "intent-abs",
        "intent-class",
        "intent-derivative-subsup",
        "intent-fenced",
        "intent-frac",
        "intent-function",
        "intent-nary",
        "intent-off",
        "intent-partial-derivative",
        "intent-split",
        "intent-symbol",
        "intent-table",
        "intent-unicodemath-spec",
        "intent-unicodemath-spec-off",
        "intent-spec",
      ].sort(),
    );
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    expect(rows.filter((row) => row.group === "intent-spec")).toHaveLength(8);
    expect(rows.filter((row) => row.group === "intent-unicodemath-spec")).toHaveLength(12);
    expect(rows.filter((row) => row.group === "intent-unicodemath-spec-off")).toHaveLength(12);
    expect(rows.filter((row) => row.group === "intent-class").length).toBeGreaterThanOrEqual(
      13 + 15 + 9,
    );
    expect(rendered.length + refused.length).toBe(rows.length);
    // A suite that quietly compares nothing would pass every assertion below.
    expect(rendered.length).toBeGreaterThan(150);
  });

  it("name only rows the gem renders, in the refusal pin", () => {
    const renderedIds = new Set(rendered.map((row) => row.id));
    for (const id of Object.keys(PORT_REFUSES)) expect(renderedIds.has(id), id).toBe(true);
  });
});

describe("intent: true matches the gem byte for byte, the rows the gem renders", () => {
  it.each(rendered.map((row) => [row.id, row] as const))("%s", (_id, row) => {
    const reason = PORT_REFUSES[row.id];
    if (reason !== undefined) {
      expect(() => render(row)).toThrow(RenderError);
      expect(() => render(row)).toThrow(/No measured mathml rendering/);
      expect(() => render(row)).toThrow(reason);
      return;
    }
    expect(render(row)).toBe(row.expected);
  });
});

describe("intent: true is refused where the gem refuses", () => {
  // The gem funnels every StandardError into `ParseError` at the formula
  // boundary (`wrap_render_error`); a parse refusal and a render refusal are
  // different rows (`raisedIn`), and the port keeps them apart.
  it.each(refused.map((row) => [row.id, row] as const))("%s", (_id, row) => {
    if (row.raisedIn === "parse") {
      expect(() => build(row)).toThrow();
      return;
    }
    expect(row.raisedIn).toBe("render");
    const tree = build(row);
    expect(() => toMathml(tree, { ...row.options } as never)).toThrow(RenderError);
  });

  it("a lone Symbols::UpcaseDd is one of them: nodes[1].name on nil (formula.rb:649)", () => {
    const lone = refused.find((row) => row.id === "intent-own-upcasedd-lone");
    expect(lone?.raisedIn).toBe("render");
    expect(() => render(lone as Row)).toThrow(/formula\.rb:649/);
    // With the flag off the very same tree renders (probed: the row below).
    const off = toMathml(build(lone as Row), {});
    expect(off).toContain("<mi>&#x2145;</mi>");
    expect(off).not.toContain("intent");
  });
});

describe("the fixtures measure what the pipeline claims", () => {
  const all = (pattern: RegExp): number =>
    rendered.filter((row) => pattern.test(row.expected as string)).length;

  /**
   * Every intent-bearing class shows up in the gem's own bytes at least once,
   * so a class this port stopped tagging would fail a row above, not slip past
   * an input list that never reached it. The names are the gem's.
   */
  it.each([
    ["Sum", /intent=":sum\(/],
    ["Prod", /intent=":product\(/],
    ["Int", /intent=":integral\(/],
    ["Oint", /intent=":contour integral\(/],
    ["Nary (n-ary) default", /intent=":n-ary\(/],
    ["Nary Iiiint", /intent=":quadruple integral\(/],
    ["Nary Iiint", /intent=":triple integral\(/],
    ["Nary Iint", /intent=":double integral\(/],
    ["Nary Oiint", /intent=":surface integral\(/],
    ["Nary Oiiint", /intent=":volume integral\(/],
    ["Nary Coprod", /intent=":coproduct\(/],
    ["Nary Intclockwise", /intent=":clockwise contour integral\(/],
    ["Nary Cntclockoint", /intent=":anticlockwise contour integral\(/],
    ["UnaryFunction / Lim / Inf / Formula", /intent=":function"/],
    ["Abs", /intent="absolute-value\(/],
    ["Fenced", /intent=":fenced"/],
    ["Fenced open-closed-interval", /intent="open-closed-interval\(/],
    ["Fenced closed-interval", /intent="closed-interval\(/],
    ["Fenced closed-open-interval", /intent="closed-open-interval\(/],
    ["Fenced open-interval", /intent="open-interval\(/],
    ["Fenced binomial-coefficient", /intent="binomial-coefficient\(/],
    ["Frac derivative", /intent=":derivative\(/],
    ["Frac partial-derivative", /intent=":partial-derivative\(/],
    ["Table matrix", /intent=":matrix\(/],
    ["Table fenced", /<mrow intent=":fenced"><mo>/],
    ["Array / Eqarray / Cases equations", /intent=":equations"/],
    ["Eqarray / Cases cases", /intent=":cases"/],
    ["Pmatrix", /intent=":parenthesized-matrix"/],
    ["Vmatrix", /intent=":determinant"/],
    ["Vmatrix (norm)", /intent=":normed-matrix"/],
    ["Bmatrix", /intent=":bracketed-matrix"/],
    ["Bmatrix (curly)", /intent=":curly-braced-matrix"/],
    ["Dd", /<mi intent="ⅆ">/],
    ["UpcaseDd", /<mi intent="ⅅ">/],
    ["Ii", /<mi intent="ⅈ">/],
    ["Jj", /<mi intent="ⅉ">/],
    ["Intercal", /<mi intent="transpose">/],
    ["Intent", /intent="Ackermann"/],
  ] as const)("%s appears in the gem's output", (_name, pattern) => {
    expect(all(pattern)).toBeGreaterThan(0);
  });
});

describe("the intent option", () => {
  const sum = (): MathNode => parseAsciimath("sum_(i=1)^n i");

  it("false, null, undefined and the omitted keyword are one render, and intent: true is another", () => {
    const plain = toMathml(sum(), {});
    for (const off of [false, null, undefined]) {
      expect(toMathml(sum(), { intent: off })).toBe(plain);
    }
    expect(toMathml(sum(), { intent: true })).not.toBe(plain);
    expect(toMathml(sum(), { intent: true })).toContain('intent=":sum($l,n,$naryand)"');
  });

  it("composes with unaryFunctionSpacing and formatter", () => {
    const tree = parseAsciimath("sin x");
    expect(toMathml(tree, { intent: true, unaryFunctionSpacing: false })).toContain(
      '<mrow intent=":function"><mi>sin</mi>',
    );
    expect(toMathml(tree, { intent: true })).toContain('<mo rspace="thickmathspace"/>');
  });

  it("rendering twice gives the same bytes and leaves the tree untouched", () => {
    const tree = parseLatex("\\frac{\\partial f}{{\\partial x y}^{\\prime}}");
    const before = JSON.stringify(normalize(tree));
    const first = toMathml(tree, { intent: true });
    expect(toMathml(tree, { intent: true })).toBe(first);
    expect(JSON.stringify(normalize(tree))).toBe(before);
  });
});
