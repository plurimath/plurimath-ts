import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PargRuntime } from "parsanol";
import { afterEach, describe, expect, it, vi } from "vitest";
import Plurimath from "../../../src/compat/index";
import { normalize, ParseError } from "../../../src/core/index";
import { parseHtml } from "../../../src/formats/html/parser";
import { htmlRuntime } from "../../../src/formats/html/stage";
import source from "./initialized-source.json";

// A default parser must consume the artifact; a legacy grammar fallback would
// conceal an artifact/runtime failure and let syntax acceptance drift again.
vi.mock("../../../src/formats/html/grammar", () => ({
  htmlGrammar: () => {
    throw new Error("handwritten HTML grammar was used");
  },
}));

afterEach(() => vi.restoreAllMocks());

interface Observation {
  id: string;
  input: string;
  locale?: string;
  model?: unknown;
  raises?: string;
  rendered?: Record<string, { bytes?: string; raises?: string }>;
}
const fixture = JSON.parse(
  readFileSync(new URL("./default-stage.json", import.meta.url), "utf8"),
) as {
  oracle: { commit: string };
  generatorSha256: string;
  serializerSha256: string;
  cases: Observation[];
};
const digest = (path: string) =>
  createHash("sha256")
    .update(readFileSync(new URL(path, import.meta.url)))
    .digest("hex");

describe("the current Ruby facade through the default HTML artifact", () => {
  it("pins nonempty observations and their producer", () => {
    expect(fixture.oracle.commit).toBe("b0a695cbc5ce31fe8d0d3934d0c93428bb6d200e");
    expect(fixture.generatorSha256).toBe(digest("../../../scripts/probes/html-default-stage.rb"));
    expect(fixture.serializerSha256).toBe(digest("../../../scripts/generate-corpus.rb"));
    expect(fixture.cases).toHaveLength(24);
    expect(fixture.cases.filter((row) => row.model !== undefined)).toHaveLength(19);
    expect(fixture.cases.filter((row) => row.raises !== undefined)).toHaveLength(5);
  });

  it.each(fixture.cases)("$id preserves the model or refusal", (row) => {
    const parse = () => parseHtml(row.input, row.locale ? { locale: row.locale } : undefined);
    if (row.raises) expect(parse).toThrow(ParseError);
    else expect(normalize(parse())).toStrictEqual(row.model);
  });

  const renderers: Record<string, (formula: Plurimath) => string> = {
    asciimath: (formula) => formula.toAsciimath(),
    latex: (formula) => formula.toLatex(),
    mathml: (formula) => formula.toMathml(),
    html: (formula) => formula.toHtml(),
    unicode: (formula) => formula.toUnicodemath(),
    omml: (formula) => formula.toOmml(),
  };
  const renders = fixture.cases
    .filter((row) => !row.locale)
    .flatMap((row) =>
      Object.entries(row.rendered ?? {}).map(([target, expected]) => ({ row, target, expected })),
    );
  it("covers every writer through the public compat constructor", () => {
    expect(renders).toHaveLength(96);
    expect(new Set(renders.map((row) => row.target))).toEqual(new Set(Object.keys(renderers)));
  });
  it.each(renders)("$row.id → $target", ({ row, target, expected }) => {
    const formula = new Plurimath(row.input, "html");
    const render = () => (renderers[target] as (formula: Plurimath) => string)(formula);
    if (expected.raises) expect(render).toThrow();
    else expect(render()).toBe(expected.bytes);
  });
});

describe("the default HTML parser uses the shared PARG artifact", () => {
  const selected = new Set([
    "colour-named",
    "fence-round-expression",
    "matrix-two-by-two",
    "mixed-greek-sequence",
    "mixed-binomial-square",
  ]);
  const rows = source.cases.filter((row) => selected.has(row.id));
  it("selects every named Ruby observation", () => expect(rows).toHaveLength(selected.size));
  it.each(rows)("$id retains the Ruby model", (row) => {
    expect(normalize(parseHtml(row.input))).toStrictEqual(row.model);
  });

  it("uses the artifact runtime in strict compatibility mode", () => {
    const call = vi.spyOn(PargRuntime.prototype, "parseShapeWithCompatibility");
    parseHtml("x<sup>2</sup>");
    expect(call).toHaveBeenCalledWith("x<sup>2</sup>", "strict");
  });

  it("reuses only the matching decimal runtime", () => {
    expect(htmlRuntime(".")).toBe(htmlRuntime("."));
    expect(htmlRuntime(",")).toBe(htmlRuntime(","));
    expect(htmlRuntime("٫")).toBe(htmlRuntime("٫"));
    expect(htmlRuntime(".")).not.toBe(htmlRuntime(","));
    expect(() => htmlRuntime("unknown")).toThrow(TypeError);
  });

  it.each(["dot", "comma", "arabic"])("preserves the checked %s artifact bytes", (entry) => {
    const bytes = readFileSync(
      new URL(`../../../assets/html/${entry}.json`, import.meta.url),
      "utf8",
    );
    expect(`${JSON.stringify(JSON.parse(bytes), null, 2)}\n`).toBe(bytes);
  });

  it("preserves engine failures rather than trying a second grammar", () => {
    const failure = new Error("runtime exhausted");
    vi.spyOn(PargRuntime.prototype, "parseShapeWithCompatibility").mockImplementation(() => {
      throw failure;
    });
    expect(() => parseHtml("x")).toThrow(failure);
  });

  it("maps normalized UTF-8 refusal offsets to the original UTF-16 input", () => {
    vi.spyOn(PargRuntime.prototype, "parseShapeWithCompatibility").mockReturnValue({
      ok: false,
      error: { offset: 2, ranked: [] },
    });
    try {
      parseHtml("α<");
      expect.unreachable("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).index).toBe(1);
    }
  });
});
