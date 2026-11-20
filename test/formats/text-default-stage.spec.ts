import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { CallDepthLimitExceeded, PargRuntime } from "parsanol";
import { afterEach, describe, expect, it, vi } from "vitest";
import Plurimath from "../../src/compat/index";
import { type FormulaNode, normalize, ParseError } from "../../src/core/index";
import { toAsciimath } from "../../src/formats/asciimath/index";
import { toHtml } from "../../src/formats/html/index";
import { parseLatex, parseLatexTree } from "../../src/formats/latex/parser";
import { toLatex } from "../../src/formats/latex/renderer";
import { latexStage } from "../../src/formats/latex/stage";
import { toMathml } from "../../src/formats/mathml/index";
import { toOmml } from "../../src/formats/omml/index";
import { parseUnicodemath, parseUnicodemathTree } from "../../src/formats/unicodemath/parser";
import { toUnicodemath } from "../../src/formats/unicodemath/renderer";
import { UnicodemathRuntime, unicodemathStage } from "../../src/formats/unicodemath/stage";

vi.mock("../../src/formats/latex/grammar", () => ({
  latexGrammar: () => {
    throw new Error("handwritten LaTeX grammar was used");
  },
}));
vi.mock("../../src/formats/unicodemath/grammar", () => ({
  parseUnicodemathPreprocessed: () => {
    throw new Error("handwritten UnicodeMath grammar was used");
  },
}));
afterEach(() => vi.restoreAllMocks());

interface Observation {
  id: string;
  format: "latex" | "unicode";
  input: string;
  locale?: string;
  model?: unknown;
  raises?: string;
  rendered?: Record<string, { bytes?: string; raises?: string }>;
}
const fixture = JSON.parse(
  readFileSync(new URL("./text-default-stage.json", import.meta.url), "utf8"),
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
const parse = (row: Observation) =>
  (row.format === "latex" ? parseLatex : parseUnicodemath)(
    row.input,
    row.locale ? { locale: row.locale } : undefined,
  );
// Writer comparisons reuse the model observation; each public input is parsed
// once here, and the compat constructor below exercises public dispatch again.
const parsed = new Map<Observation, FormulaNode>();
function observedModel(row: Observation): FormulaNode {
  let formula = parsed.get(row);
  if (formula === undefined) {
    formula = parse(row);
    parsed.set(row, formula);
  }
  return formula;
}

const writers: Record<string, (formula: FormulaNode) => string> = {
  asciimath: toAsciimath,
  latex: toLatex,
  mathml: toMathml,
  omml: toOmml,
  unicode: toUnicodemath,
  html: toHtml,
};

describe("the default text parsers through the Ruby-derived PARG stages", () => {
  it("pins nonempty reference observations and their generators", () => {
    expect(fixture.oracle.commit).toBe("b0a695cbc5ce31fe8d0d3934d0c93428bb6d200e");
    expect(fixture.generatorSha256).toBe(digest("../../scripts/probes/text-default-stage.rb"));
    expect(fixture.serializerSha256).toBe(digest("../../scripts/generate-corpus.rb"));
    expect(fixture.cases).toHaveLength(37);
    expect(fixture.cases.filter((row) => row.model !== undefined)).toHaveLength(28);
    expect(fixture.cases.filter((row) => row.raises !== undefined)).toHaveLength(9);
  });
  it.each(fixture.cases)("$id preserves the Ruby model or refusal", (row) => {
    if (row.raises) expect(() => parse(row)).toThrow(ParseError);
    else expect(normalize(observedModel(row))).toStrictEqual(row.model);
  });
  const renders = fixture.cases.flatMap((row) =>
    Object.entries(row.rendered ?? {}).map(([target, expected]) => ({ row, target, expected })),
  );
  it("covers every writer and both text formats", () => {
    expect(renders).toHaveLength(168);
    expect(new Set(renders.map((row) => row.target))).toEqual(new Set(Object.keys(writers)));
  });
  it.each(renders)("$row.id → $target", ({ row, target, expected }) => {
    const render = () => (writers[target] as (formula: FormulaNode) => string)(observedModel(row));
    if (expected.raises) expect(render).toThrow();
    else expect(render()).toBe(expected.bytes);
  });
  it.each(fixture.cases.filter((row) => !row.locale && row.model !== undefined))(
    "$id is reachable through the public constructor",
    (row) => {
      const formula = new Plurimath(row.input, row.format);
      expect(formula.toLatex()).toBe(row.rendered?.latex?.bytes);
      expect(formula.toUnicodemath()).toBe(row.rendered?.unicode?.bytes);
    },
  );
});

describe.each([
  {
    name: "latex",
    package: "latexmath-ts",
    artifact: "latex",
    stage: latexStage,
    parser: parseLatex,
    tree: parseLatexTree,
    spy: () => vi.spyOn(PargRuntime.prototype, "parseShape"),
  },
  {
    name: "unicode",
    package: "umath-ts",
    artifact: "umath",
    stage: unicodemathStage,
    parser: parseUnicodemath,
    tree: parseUnicodemathTree,
    spy: () => vi.spyOn(UnicodemathRuntime.prototype, "parseShapeWithReporter"),
  },
])("the $name stage boundary", (config) => {
  const require = createRequire(import.meta.url);
  it("preserves the checked artifact bytes and manifest digest", () => {
    const artifact = readFileSync(
      require.resolve(`@plurimath/${config.package}/artifacts/${config.artifact}.json`),
      "utf8",
    );
    const manifest = JSON.parse(
      readFileSync(require.resolve(`@plurimath/${config.package}/artifacts/manifest.json`), "utf8"),
    ) as { files: Record<string, string> };
    expect(`${JSON.stringify(JSON.parse(artifact))}\n`).toBe(artifact);
    expect(createHash("sha256").update(artifact).digest("hex")).toBe(
      manifest.files[`artifacts/${config.artifact}.json`],
    );
    expect(config.stage()).toBe(config.stage());
  });
  it("reuses the matching decimal runtime", () => {
    const call = config.spy();
    config.parser("1.5");
    config.parser("2.5");
    config.parser("1,5", { locale: "de" });
    config.parser("2,5", { locale: "de" });
    config.parser("1٫5", { locale: "ar" });
    config.parser("2٫5", { locale: "ar" });
    expect(call.mock.contexts).toHaveLength(6);
    expect(call.mock.contexts[0]).toBe(call.mock.contexts[1]);
    expect(call.mock.contexts[2]).toBe(call.mock.contexts[3]);
    expect(call.mock.contexts[4]).toBe(call.mock.contexts[5]);
    expect(new Set(call.mock.contexts).size).toBe(3);
    if (config.name === "unicode") expect(call).toHaveBeenCalledWith("1.5", "parslet", "deepest");
  });
  it("propagates runtime failures without a second parser", () => {
    const failure = new CallDepthLimitExceeded(1025, 1024);
    config.spy().mockImplementation(() => {
      throw failure;
    });
    expect(() => config.parser("x")).toThrow(failure);
    expect(() => config.tree("x")).toThrow(failure);
  });
  it("maps stage UTF-8 syntax offsets onto the caller's UTF-16 input", () => {
    const failure = Object.assign(new Error("syntax refusal"), { byteOffset: 2, charOffset: 1 });
    vi.spyOn(config.stage(), "parse").mockImplementation(() => {
      throw failure;
    });
    try {
      config.parser("α{");
      expect.unreachable("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(ParseError);
      expect((error as ParseError).index).toBe(1);
    }
  });
  it("still exposes capture trees without the handwritten grammar", () => {
    expect(config.tree("x^2")).toBeDefined();
  });
});

describe("the pinned umath reporter adapter", () => {
  it.each([
    ["recursion_limit", "RecursionLimitExceeded"],
    ["call_depth_limit", "CallDepthLimitExceeded"],
    ["shape_depth_limit", "ShapeDepthLimitExceeded"],
  ])("retains %s metadata in native wire refusals", (category, name) => {
    for (const delivery of ["envelope", "throw"]) {
      const wire = {
        category,
        depth: 1025,
        // biome-ignore lint/style/useNamingConvention: native resource wire key.
        max_depth: 1024,
        message: "native resource budget",
      };
      const native = vi.fn(() => {
        if (delivery === "throw") throw wire;
        return JSON.stringify({ ok: false, error: wire });
      });
      const runtime = Object.create(UnicodemathRuntime.prototype) as UnicodemathRuntime;
      Object.defineProperties(runtime, {
        entry: { value: "dot" },
        artifact: { value: { parseShapeWithReporter: native } },
      });
      try {
        runtime.parseShapeWithReporter("x", "parslet", "deepest");
        expect.unreachable("expected a resource refusal");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).toMatchObject({ name, category, depth: 1025, maxDepth: 1024 });
      }
      expect(native).toHaveBeenCalledWith("dot", "x", "parslet", "deepest");
    }
  });
});
