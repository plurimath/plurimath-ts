/**
 * Oracle-backed parity for the `BinaryFunction` kinds no AsciiMath input
 * builds: `Over`, `Menclose`, `Mlabeledtr`, `Stackrel` and `Inf`, in all six
 * renderers. The gem renders them in every format; the port's carrier files
 * used to admit only the names the AsciiMath transform constructs and refuse
 * the rest.
 *
 * Fixtures are generated, never hand-typed (the `binary-function-kinds` group of
 * `scripts/generate-render-options-fixtures.rb`); each row is one input and,
 * per target format, the gem's answer to `formula.to_<format>`:
 *
 *   - `expected`        the gem's exact bytes; the port must match them;
 *   - `raises`          the gem refused (`Formula#wrap_render_error` funnels every
 *                       `NoMethodError` into `ParseError`); the port must refuse
 *                       with a `RenderError`;
 *   - `unreproducible`  the gem printed a node through `Object#to_s`, which holds
 *                       a heap address, so no bytes can be recorded; the port
 *                       must refuse rather than invent them.
 *
 * A refusal here is a RENDER refusal: every input is parsed (or built from its
 * model) before anything renders, and a parse failure fails the test outright
 * instead of counting as a refusal.
 *
 * Input: `input.text` in a syntax the port parses (asciimath, latex, html,
 * unicodemath), else `input.model` — a hand-built formula, or the gem's parse
 * of a MathML source, which the port has no parser for.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type MathNode, RenderError } from "../../src/core/index";
import { parseAsciimath, toAsciimath } from "../../src/formats/asciimath/index";
import { parseHtml, toHtml } from "../../src/formats/html/index";
import { parseLatex, toLatex } from "../../src/formats/latex/index";
import { toMathml } from "../../src/formats/mathml/index";
import { toOmml } from "../../src/formats/omml/index";
import { parseUnicodemath, toUnicodemath } from "../../src/formats/unicodemath/index";
import { aliasIndex, buildNode, readCensus, type SerializedNode } from "../core/model-builder";

type Target = "asciimath" | "latex" | "mathml" | "html" | "omml" | "unicodemath";

interface Result {
  readonly expected?: string;
  readonly raises?: string;
  readonly raisedIn?: string;
  readonly unreproducible?: string;
}

interface Row {
  readonly id: string;
  readonly group: string;
  readonly input: {
    readonly format?: string;
    readonly text?: string;
    readonly model?: SerializedNode;
  };
  readonly options?: { readonly displayStyle?: boolean };
  readonly results: Readonly<Partial<Record<Target, Result>>>;
}

interface Fixture {
  readonly schema: string;
  readonly caseCount: number;
  readonly renderedCount: number;
  readonly raisedCount: number;
  readonly unreproducibleCount: number;
  readonly cases: readonly Row[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const CENSUS_ALIASES = aliasIndex(readCensus());
const TARGETS: readonly Target[] = ["asciimath", "latex", "mathml", "html", "omml", "unicodemath"];

const fixture = JSON.parse(
  readFileSync(join(HERE, "binary-function", "render-kinds-fixtures.json"), "utf8"),
) as Fixture;

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
    case "unicodemath":
      return parseUnicodemath(text);
    default:
      throw new Error(`${row.id}: unknown input format ${row.input.format}`);
  }
}

function render(target: Target, tree: MathNode, row: Row): string {
  switch (target) {
    case "asciimath":
      return toAsciimath(tree);
    case "latex":
      return toLatex(tree);
    case "mathml":
      return toMathml(tree);
    case "html":
      return toHtml(tree);
    case "omml":
      return toOmml(tree, row.options?.displayStyle === undefined ? {} : row.options);
    case "unicodemath":
      return toUnicodemath(tree);
  }
}

const results = fixture.cases.flatMap((row) =>
  TARGETS.filter((target) => row.results[target] !== undefined).map((target) => ({
    row,
    target,
    result: row.results[target] as Result,
  })),
);
const named = (kind: keyof Result) =>
  results
    .filter(({ result }) => result[kind] !== undefined)
    .map(({ row, target, result }) => [`${row.id} -> ${target}`, row, target, result] as const);

describe("the binary-function-kinds fixture", () => {
  it("counts its own rows", () => {
    expect(fixture.schema).toBe("plurimath-corpus/render-binary-kinds/1");
    expect(fixture.caseCount).toBe(fixture.cases.length);
    expect(fixture.renderedCount).toBe(named("expected").length);
    expect(fixture.raisedCount).toBe(named("raises").length);
    expect(fixture.unreproducibleCount).toBe(named("unreproducible").length);
    expect(new Set(fixture.cases.map((row) => row.id)).size).toBe(fixture.cases.length);
    // Every result is exactly one of the three shapes (`raises` names where it raised).
    for (const { row, target, result } of results) {
      const shape = Object.keys(result).filter((key) => key !== "raisedIn");
      expect(shape, `${row.id} ${target}`).toHaveLength(1);
      if (result.raises !== undefined)
        expect(result.raisedIn, `${row.id} ${target}`).toBe("render");
    }
  });

  it("covers each of the five kinds in every format", () => {
    for (const kind of ["over", "menclose", "mlabeledtr", "stackrel", "inf"]) {
      const rows = fixture.cases.filter((row) => row.group === kind);
      expect(rows.length, kind).toBeGreaterThan(5);
      for (const target of TARGETS) {
        const answered = rows.filter((row) => row.results[target]?.expected !== undefined);
        expect(answered.length, `${kind} ${target}`).toBeGreaterThan(0);
      }
    }
  });

  it("pins refusals as well as bytes, and the two are not the same set", () => {
    expect(named("raises").length).toBeGreaterThan(0);
    expect(named("unreproducible").length).toBeGreaterThan(0);
  });

  it("keeps a row whose inputs the port parses apart from one it cannot", () => {
    const parsed = fixture.cases.filter((row) => row.input.model === undefined);
    const modelled = fixture.cases.filter((row) => row.input.model !== undefined);
    expect(parsed.length).toBeGreaterThan(0);
    expect(modelled.length).toBeGreaterThan(0);
    for (const row of parsed) {
      expect(["asciimath", "latex", "html", "unicodemath"], row.id).toContain(row.input.format);
    }
  });
});

describe("binary-function kinds: the gem's bytes", () => {
  it.each(named("expected"))("%s matches the gem byte-for-byte", (_name, row, target, result) => {
    expect(render(target, build(row), row)).toBe(result.expected);
  });
});

describe("binary-function kinds: the rows the gem refuses", () => {
  it.each(named("raises"))("%s is refused too", (_name, row, target) => {
    const tree = build(row);
    expect(() => render(target, tree, row)).toThrow(RenderError);
  });
});

describe("binary-function kinds: the rows whose gem bytes hold a heap address", () => {
  it.each(named("unreproducible"))("%s is refused, not invented", (_name, row, target) => {
    const tree = build(row);
    expect(() => render(target, tree, row)).toThrow(RenderError);
  });
});
