/**
 * Oracle-backed parity for calls that pass options to `toMathml` and `toOmml`:
 * `splitOnLinebreak` on both, `displayStyle` on OMML (roadmap B3).
 *
 * Fixtures are generated, never hand-typed, and the rows are the gem's own
 * answers to an exact call:
 *   ruby scripts/generate-render-options-fixtures.rb --oracle <clean pinned checkout>
 *
 * Where the case list comes from, so a reader can tell what this proves:
 *
 *   - `line-break-spec` and `line-break-spec-display-style`: the 90 hand-built
 *     formulas of the gem's own line-break specs, rebuilt from their serialized
 *     model. The gem's specs render each with `split_on_linebreak: true` (and
 *     `unary_function_spacing: false` for MathML). These carry the gem's
 *     oddities — the LineBreak_002 slices among them — so this spec passing IS
 *     the claim that the port reproduces them rather than repairing them.
 *   - `parsed-linebreak`: LaTeX `\\` and HTML `<br/>` sources parsed by BOTH
 *     parsers, which are the two syntaxes that produce a `Linebreak`.
 *   - `display-style-spec`: the gem's own `.to_omml` inputs from
 *     `asciimath_spec.rb`, with and without `display_style: false`.
 *   - `display-style-probe`: measured, not from a spec — the inputs the option
 *     is observable on, under every spelling of it. `nil` is FALSE here, and
 *     that is a measured fact about the gem, not the default.
 *
 * Every fixture row is asserted: byte-for-byte where the gem renders, a
 * `RenderError`/`ParseError` where it refused. A row the port cannot yet
 * reproduce is named in `PORT_REFUSES` below (98 rows, all kind-renderer
 * refusals).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FormulaNode, type MathNode, RenderError, SymbolNode } from "../../src/core/index";
import { splitOnLinebreak } from "../../src/core/linebreak";
import { normalize } from "../../src/core/normalize";
import { parseAsciimath } from "../../src/formats/asciimath/index";
import { parseHtml } from "../../src/formats/html/index";
import { parseLatex } from "../../src/formats/latex/index";
import { toMathml } from "../../src/formats/mathml/renderer";
import { toOmml } from "../../src/formats/omml/renderer";
import { aliasIndex, buildNode, readCensus, type SerializedNode } from "../core/model-builder";

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
  /** `Formula#new_line_support`, one serialized model per line. */
  readonly split?: readonly unknown[];
}

/** Rows the gem renders that the port renders too, per format (a pin, not a knob). */
const RENDERED_BASELINE = { mathml: 168, omml: 165 } as const;

interface Fixture {
  readonly schema: string;
  readonly format: string;
  readonly caseCount: number;
  readonly renderedCount: number;
  readonly raisedCount: number;
  readonly cases: readonly Row[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const CENSUS_ALIASES = aliasIndex(readCensus());

/**
 * Rows the gem renders and this port's KIND renderers do not, by id: 26 for
 * MathML and 78 for OMML. Every one refuses on a node kind or alias the
 * per-kind renderer has not measured (`Longdiv`, `Phantom`, `Underover`, the
 * unmeasured unary aliases...). For all but six the same refusal occurs without
 * `splitOnLinebreak`; the six (MathML `line-break-029`, OMML `012` and `029`,
 * each with its `-display-false` variant) render unsplit, and only refuse
 * because splitting yields a transformed alias the kind renderer has not
 * measured — a kind-renderer gap, not a walker mismatch (the split itself is
 * checked against the gem for every row below). The
 * split itself is checked for every one of them in the walk tests below, which
 * need no renderer; here each is pinned as a refusal, and the message must be a
 * kind file's own (`KIND_REFUSAL`), so a fault in the walker cannot hide in
 * the set. An entry that starts rendering fails its test until it is dropped.
 */
const PORT_REFUSES: { readonly mathml: readonly string[]; readonly omml: readonly string[] } = {
  mathml: [
    "line-break-002",
    "line-break-002-display-false",
    "line-break-024",
    "line-break-024-display-false",
    "line-break-029",
    "line-break-029-display-false",
    "line-break-056",
    "line-break-056-display-false",
    "line-break-057",
    "line-break-057-display-false",
    "line-break-058",
    "line-break-058-display-false",
    "line-break-059",
    "line-break-059-display-false",
    "line-break-076",
    "line-break-076-display-false",
    "line-break-077",
    "line-break-077-display-false",
    "line-break-083",
    "line-break-083-display-false",
    "line-break-084",
    "line-break-084-display-false",
    "line-break-090",
    "line-break-090-display-false",
  ],
  omml: [
    "asciimath-spec-omml-08",
    "asciimath-spec-omml-08-display-false",
    "asciimath-spec-omml-11",
    "asciimath-spec-omml-11-display-false",
    "line-break-002",
    "line-break-002-display-false",
    "line-break-008",
    "line-break-008-display-false",
    "line-break-009",
    "line-break-009-display-false",
    "line-break-012",
    "line-break-012-display-false",
    "line-break-013",
    "line-break-013-display-false",
    "line-break-014",
    "line-break-014-display-false",
    "line-break-015",
    "line-break-015-display-false",
    "line-break-017",
    "line-break-017-display-false",
    "line-break-018",
    "line-break-018-display-false",
    "line-break-020",
    "line-break-020-display-false",
    "line-break-021",
    "line-break-021-display-false",
    "line-break-022",
    "line-break-022-display-false",
    "line-break-024",
    "line-break-024-display-false",
    "line-break-026",
    "line-break-026-display-false",
    "line-break-027",
    "line-break-027-display-false",
    "line-break-028",
    "line-break-028-display-false",
    "line-break-029",
    "line-break-029-display-false",
    "line-break-030",
    "line-break-030-display-false",
    "line-break-031",
    "line-break-031-display-false",
    "line-break-032",
    "line-break-032-display-false",
    "line-break-034",
    "line-break-034-display-false",
    "line-break-037",
    "line-break-037-display-false",
    "line-break-050",
    "line-break-050-display-false",
    "line-break-055",
    "line-break-055-display-false",
    "line-break-056",
    "line-break-056-display-false",
    "line-break-057",
    "line-break-057-display-false",
    "line-break-058",
    "line-break-058-display-false",
    "line-break-059",
    "line-break-059-display-false",
    "line-break-064",
    "line-break-064-display-false",
    "line-break-073",
    "line-break-073-display-false",
    "line-break-076",
    "line-break-076-display-false",
    "line-break-077",
    "line-break-077-display-false",
    "line-break-083",
    "line-break-083-display-false",
    "line-break-084",
    "line-break-084-display-false",
    "line-break-090",
    "line-break-090-display-false",
  ],
};

/** What a kind renderer says when it has not measured a kind, alias or slot. */
const KIND_REFUSAL = /has not been measured|No measured \w+ rendering|only the measured generic/;

const RENDERERS = {
  mathml: (node: MathNode, options: Record<string, unknown>) => toMathml(node, options as never),
  omml: (node: MathNode, options: Record<string, unknown>) => toOmml(node, options as never),
} as const;

function build(row: Row): MathNode {
  if (row.input.model !== undefined) return buildNode(row.input.model, CENSUS_ALIASES);
  const text = row.input.text as string;
  switch (row.input.format) {
    case "asciimath":
      return parseAsciimath(text);
    case "latex":
      return parseLatex(text);
    case "html":
      return parseHtml(text);
    default:
      throw new Error(`${row.id}: unknown input format ${row.input.format}`);
  }
}

function load(format: "mathml" | "omml"): Fixture {
  return JSON.parse(
    readFileSync(join(HERE, format, "render-options-fixtures.json"), "utf8"),
  ) as Fixture;
}

for (const format of ["mathml", "omml"] as const) {
  const fixture = load(format);
  const render = RENDERERS[format];
  const refuses = new Set(PORT_REFUSES[format]);
  const rendered = fixture.cases.filter((row) => row.expected !== undefined);
  const refused = fixture.cases.filter((row) => row.raises !== undefined);

  describe(`${format} render-options fixture`, () => {
    it("counts its own rows", () => {
      expect(fixture.schema).toBe("plurimath-corpus/render-options/1");
      expect(fixture.format).toBe(format);
      expect(fixture.caseCount).toBe(fixture.cases.length);
      expect(fixture.renderedCount).toBe(rendered.length);
      expect(fixture.raisedCount).toBe(refused.length);
      expect(new Set(fixture.cases.map((row) => row.id)).size).toBe(fixture.cases.length);
    });

    it("carries all 90 of the gem's line-break fixtures, twice", () => {
      const spec = fixture.cases.filter((row) => row.group === "line-break-spec");
      const display = fixture.cases.filter((row) => row.group === "line-break-spec-display-style");
      expect(spec).toHaveLength(90);
      expect(display).toHaveLength(90);
      for (const row of [...spec, ...display]) {
        expect(row.options.splitOnLinebreak, row.id).toBe(true);
        expect(row.input.model, row.id).toBeDefined();
      }
    });

    it("every row splits into more than one line or is a measured single line", () => {
      // A split that never split would make the whole file vacuous: at least
      // some rows must show the gem's break run or a second document.
      const multi = rendered.filter((row) =>
        format === "omml"
          ? (row.expected as string).includes("<br/>")
          : (row.expected as string).split("<math ").length > 2,
      );
      expect(multi.length).toBeGreaterThan(50);
    });
  });

  describe(`${format} render-options parity, the rows the gem renders`, () => {
    it.each(rendered.map((row) => [row.id, row] as const))(
      "%s matches the gem byte-for-byte",
      (_id, row) => {
        if (refuses.has(row.id)) {
          expect(() => render(build(row), { ...row.options })).toThrow(RenderError);
          expect(() => render(build(row), { ...row.options })).toThrow(KIND_REFUSAL);
          return;
        }
        expect(render(build(row), { ...row.options })).toBe(row.expected);
      },
    );
  });

  describe(`${format} render-options parity, the pinned kind refusals`, () => {
    it("names only rows the gem renders, and counts them", () => {
      const renderedIds = new Set(rendered.map((row) => row.id));
      expect(PORT_REFUSES[format].filter((id) => !renderedIds.has(id))).toEqual([]);
      expect(new Set(PORT_REFUSES[format]).size).toBe(PORT_REFUSES[format].length);
      expect(rendered.length - refuses.size).toBe(RENDERED_BASELINE[format]);
    });
  });

  describe(`${format} render-options walk, the gem's own split`, () => {
    const splits = fixture.cases.filter((row) => row.split !== undefined);

    it("the fixture records a split for every row that asks for one", () => {
      // A `displayStyle` variant of a row shares its base row's split.
      const asking = fixture.cases.filter(
        (row) => row.options.splitOnLinebreak === true && !("displayStyle" in row.options),
      );
      expect(asking.length).toBeGreaterThan(0);
      expect(splits.map((row) => row.id)).toEqual(asking.map((row) => row.id));
    });

    it.each(splits.map((row) => [row.id, row] as const))(
      "%s splits into the gem's own formulas",
      (_id, row) => {
        const mine = splitOnLinebreak(build(row)).map((line) => normalize(line));
        // Through JSON so an `undefined` field reads as the absent key it is.
        expect(JSON.parse(JSON.stringify(mine))).toEqual(row.split);
      },
    );
  });

  // Every row the gem was asked about rendered, so there is no refusal to
  // mirror today; a regenerated fixture that gains one gets its own test here.
  if (refused.length > 0) {
    describe(`${format} render-options parity, the rows the gem refuses`, () => {
      it.each(refused.map((row) => [row.id, row] as const))("%s is refused too", (_id, row) => {
        expect(() => render(build(row), { ...row.options })).toThrow();
      });
    });
  }
}

describe("the fixtures measure what the brief claims", () => {
  const omml = load("omml");
  const byId = new Map(omml.cases.map((row) => [row.id, row]));
  const expected = (id: string): string => {
    const row = byId.get(id);
    if (row?.expected === undefined) throw new Error(`no rendered row ${id}`);
    return row.expected;
  };

  it("display_style: nil is FALSE for OMML, as it is for MathML", () => {
    expect(expected("display-probe-1-nil")).toBe(expected("display-probe-1-false"));
    expect(expected("display-probe-1-nil")).not.toBe(expected("display-probe-1-true"));
  });

  it('the strings coerce through to_s == "true"', () => {
    expect(expected("display-probe-1-str-true")).toBe(expected("display-probe-1-true"));
    expect(expected("display-probe-1-str-false")).toBe(expected("display-probe-1-false"));
  });

  it("an input with no limit-style branch is byte-identical either way", () => {
    expect(expected("display-probe-4-true")).toBe(expected("display-probe-4-false"));
  });

  it("the three limit-style inputs differ", () => {
    for (const n of [1, 2, 3]) {
      expect(expected(`display-probe-${n}-true`)).not.toBe(expected(`display-probe-${n}-false`));
    }
  });
});

describe("parsed line-break sources", () => {
  it("AsciiMath's backslash is not a Linebreak: one line comes out", () => {
    const row = load("omml").cases.find((c) => c.id === "asciimath-backslash-no-break");
    const expected = row?.expected;
    if (expected === undefined) throw new Error("no rendered row asciimath-backslash-no-break");
    expect(expected.includes("<br/>")).toBe(false);
  });
});

describe("the option surface", () => {
  const lineBroken = (): MathNode => parseLatex("a \\\\ b");

  it.each([
    ["mathml", RENDERERS.mathml],
    ["omml", RENDERERS.omml],
  ] as const)("%s: splitOnLinebreak off is byte-identical to leaving it out", (_name, render) => {
    const plain = render(lineBroken(), {});
    for (const off of [false, null, undefined]) {
      expect(render(lineBroken(), { splitOnLinebreak: off })).toBe(plain);
    }
    expect(render(lineBroken(), { splitOnLinebreak: true })).not.toBe(plain);
  });

  it.each([
    ["mathml", RENDERERS.mathml],
    ["omml", RENDERERS.omml],
  ] as const)("%s: a tree with no Linebreak splits into the one document", (_name, render) => {
    const tree = parseAsciimath("x + y");
    expect(render(tree, { splitOnLinebreak: true })).toBe(render(tree, {}));
  });

  it.each([
    ["mathml", RENDERERS.mathml],
    ["omml", RENDERERS.omml],
  ] as const)("%s: splitting leaves the caller's tree untouched", (_name, render) => {
    const tree = parseLatex("\\frac{a \\\\ b}{c} \\\\ d");
    const before = JSON.stringify(normalize(tree));
    render(tree, { splitOnLinebreak: true });
    expect(JSON.stringify(normalize(tree))).toBe(before);
  });

  it.each([
    ["mathml", RENDERERS.mathml],
    ["omml", RENDERERS.omml],
  ] as const)("%s: only a Formula can be split", (_name, render) => {
    expect(() => render(new SymbolNode({ value: "x" }), { splitOnLinebreak: true })).toThrow(
      RenderError,
    );
  });

  it("OMML displayStyle: an explicit undefined is absent, null is Ruby's nil (false)", () => {
    const limit = parseAsciimath("lim_(x->0) f(x)");
    const byDefault = RENDERERS.omml(limit, {});
    expect(RENDERERS.omml(limit, { displayStyle: undefined })).toBe(byDefault);
    expect(RENDERERS.omml(limit, { displayStyle: true })).toBe(byDefault);
    expect(RENDERERS.omml(limit, { displayStyle: null })).toBe(
      RENDERERS.omml(limit, { displayStyle: false }),
    );
    expect(RENDERERS.omml(limit, { displayStyle: false })).not.toBe(byDefault);
  });

  it("OMML displayStyle: the default is the formula's own displaystyle field", () => {
    const limit = parseAsciimath("lim_(x->0) f(x)") as FormulaNode;
    const off = new FormulaNode({ value: limit.value, displaystyle: false });
    expect(RENDERERS.omml(off, {})).toBe(RENDERERS.omml(limit, { displayStyle: false }));
    expect(RENDERERS.omml(off, { displayStyle: true })).toBe(RENDERERS.omml(limit, {}));
  });
});
