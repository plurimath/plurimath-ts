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
 * reproduce is named in `PORT_REFUSES` below (currently none).
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

/**
 * The groups this file asserts. The fixture files also carry the groups of
 * other specs (`table-frac-nary-parity.spec.ts`), which own their own counts.
 */
const OWN_GROUPS: ReadonlySet<string> = new Set([
  "line-break-spec",
  "line-break-spec-display-style",
  "parsed-linebreak",
  "display-style-spec",
  "display-style-probe",
  // `Underover` — a `TernaryFunction` subclass hand-built by
  // `underover_rows` in the generator, not reachable from `get_class`
  // reachability. OMML also carries its `displayStyle: true`/`false` rows,
  // since `Underover#to_omml_without_math_tag` branches on it explicitly.
  "underover",
]);

/** Rows the gem renders that the port renders too, per format (a pin, not a knob). */
const RENDERED_BASELINE = { mathml: 197, omml: 254 } as const;

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
 * Rows the gem renders and this port's KIND renderers do not, by id: 0 for
 * MathML and 0 for OMML. `line-break-073`/`line-break-073-display-false` used
 * to refuse here: `splitOnLinebreak` turns a `Nary`'s `Sum`/`Prod` operator
 * slot into a one-element `Formula`, and `Nary#nary_attr_value` in
 * `src/render/nary/omml.ts` did not know `Formula` forwards to its first
 * value the way the gem's `Formula#nary_attr_value` (`formula.rb:294-296`)
 * does. Both now render byte-identically.
 */
const PORT_REFUSES: { readonly mathml: readonly string[]; readonly omml: readonly string[] } = {
  mathml: [],
  omml: [],
};
/** What a kind renderer says when it has not measured a kind, alias or slot. */
const KIND_REFUSAL =
  /has not been measured|No measured \w+ rendering|only the measured generic|only a Symbol, Sum or Prod/;

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

/**
 * The rows this spec owns. The same payload carries the `unary-function` group,
 * which `unary-function-parity.spec.ts` asserts (in all six formats, with a
 * UnicodeMath parser this file's `build` has no arm for), and the `intent*`
 * groups, which `./mathml/intent-parity.spec.ts` reads (B4); the counts are
 * recomputed over what is left, and the payload gate checks the file's own.
 */
function load(format: "mathml" | "omml"): Fixture {
  const whole = JSON.parse(
    readFileSync(join(HERE, format, "render-options-fixtures.json"), "utf8"),
  ) as Fixture;
  const cases = whole.cases.filter(
    (row) => row.group !== "unary-function" && !row.group.startsWith("intent"),
  );
  return {
    ...whole,
    cases,
    caseCount: cases.length,
    renderedCount: cases.filter((row) => row.expected !== undefined).length,
    raisedCount: cases.filter((row) => row.raises !== undefined).length,
  };
}

for (const format of ["mathml", "omml"] as const) {
  const fixture = load(format);
  const render = RENDERERS[format];
  const refuses = new Set(PORT_REFUSES[format]);
  const own = fixture.cases.filter((row) => OWN_GROUPS.has(row.group));
  const rendered = own.filter((row) => row.expected !== undefined);
  const refused = own.filter((row) => row.raises !== undefined);

  describe(`${format} render-options fixture`, () => {
    it("counts its own rows", () => {
      expect(fixture.schema).toBe("plurimath-corpus/render-options/1");
      expect(fixture.format).toBe(format);
      expect(fixture.caseCount).toBe(fixture.cases.length);
      expect(fixture.renderedCount).toBe(
        fixture.cases.filter((row) => row.expected !== undefined).length,
      );
      expect(fixture.raisedCount).toBe(
        fixture.cases.filter((row) => row.raises !== undefined).length,
      );
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
