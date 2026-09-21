/**
 * Oracle-backed parity for the `TernaryFunction` subclasses that only the
 * LaTeX and UnicodeMath parsers (or a hand-built tree) reach: `Multiscript`,
 * `Limits` and `Rule`, in all six output formats.
 *
 * Fixtures are generated, never hand-typed: the `ternary-function` group of
 * each format's `render-options-fixtures.json`, one row per input, holding the
 * gem's exact bytes for that format or its refusal:
 *   ruby scripts/generate-render-options-fixtures.rb --oracle <clean pinned checkout>
 *
 * Where the inputs come from, so a reader can tell what this proves:
 *
 *   - `*-text-*`: text the gem parses itself — LaTeX `\int\limits` and `\rule`
 *     (two of them the gem's own specs) and the UnicodeMath prescript forms
 *     that build a `Multiscript`;
 *   - `spec-*`: the gem's own hand-built line-break formulas that hold one of
 *     the kinds (`LineBreak_076`, `_083`, `_090`);
 *   - `built-*`: trees built by hand for the branches no parser reaches — nil
 *     slots, empty and unequal script lists, a base that is not a `PowerBase`,
 *     scripts that are nodes rather than lists (the gem raises), `Power` and
 *     `Base` scripts, a prime.
 *
 * A cell where the gem RAISES is asserted as a `RenderError` here: the port
 * refuses too. The gem raises for every HTML `Multiscript` a parser can build
 * (its scripts are lists, which have no `to_html`) and for every HTML `Rule`
 * (`Rule#to_html` takes no `options:` keyword) — those refusals are correct.
 * That is a RENDER refusal; every input here parses, so no parse refusal is
 * pinned by this file.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type MathNode, NumberNode, RenderError, TernaryFunctionNode } from "../../src/core/index";
import { toAsciimath } from "../../src/formats/asciimath/index";
import { toHtml } from "../../src/formats/html/index";
import { parseLatex, toLatex } from "../../src/formats/latex/index";
import { toMathml } from "../../src/formats/mathml/renderer";
import { toOmml } from "../../src/formats/omml/renderer";
import { parseUnicodemath, toUnicodemath } from "../../src/formats/unicodemath/index";
import { aliasIndex, buildNode, readCensus, type SerializedNode } from "../core/model-builder";

const GROUP = "ternary-function";
const TARGETS = ["asciimath", "latex", "mathml", "html", "omml", "unicodemath"] as const;
type Target = (typeof TARGETS)[number];

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

interface Fixture {
  readonly schema: string;
  readonly format: string;
  readonly caseCount: number;
  readonly cases: readonly Row[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const CENSUS_ALIASES = aliasIndex(readCensus());

const RENDERERS: Readonly<Record<Target, (node: MathNode) => string>> = {
  asciimath: (node) => toAsciimath(node),
  latex: (node) => toLatex(node),
  mathml: (node) => toMathml(node),
  html: (node) => toHtml(node),
  omml: (node) => toOmml(node),
  unicodemath: (node) => toUnicodemath(node),
};

function build(row: Row): MathNode {
  if (row.input.model !== undefined) return buildNode(row.input.model, CENSUS_ALIASES);
  const text = row.input.text as string;
  switch (row.input.format) {
    case "latex":
      return parseLatex(text);
    case "unicodemath":
      return parseUnicodemath(text);
    default:
      throw new Error(`${row.id}: unknown input format ${row.input.format}`);
  }
}

function groupRows(target: Target): readonly Row[] {
  const fixture = JSON.parse(
    readFileSync(join(HERE, target, "render-options-fixtures.json"), "utf8"),
  ) as Fixture;
  expect(fixture.format).toBe(target);
  return fixture.cases.filter((row) => row.group === GROUP);
}

const ROWS = Object.fromEntries(TARGETS.map((target) => [target, groupRows(target)])) as Record<
  Target,
  readonly Row[]
>;

describe("ternary-function fixtures", () => {
  it("every format carries the same inputs, in the same order", () => {
    const ids = ROWS.mathml.map((row) => row.id);
    expect(ids.length).toBeGreaterThan(40);
    for (const target of TARGETS) {
      expect(
        ROWS[target].map((row) => row.id),
        target,
      ).toEqual(ids);
    }
  });

  it("covers each kind, from parsers and from hand-built trees", () => {
    const ids = ROWS.mathml.map((row) => row.id);
    for (const marker of ["limits", "multiscript", "rule"]) {
      expect(
        ids.some((id) => id.startsWith(`ternary-built-${marker}`)),
        marker,
      ).toBe(true);
    }
    expect(ids.some((id) => id.startsWith("ternary-latex-text"))).toBe(true);
    expect(ids.some((id) => id.startsWith("ternary-unicodemath-text"))).toBe(true);
    expect(ids.some((id) => id.startsWith("ternary-spec-"))).toBe(true);
  });

  it("the gem renders most cells, so the parity below is not a wall of refusals", () => {
    const rendered = TARGETS.flatMap((target) => ROWS[target]).filter(
      (row) => row.expected !== undefined,
    );
    expect(rendered.length).toBeGreaterThan(200);
  });

  it("every row is a plain call and every refusal is a render refusal", () => {
    for (const target of TARGETS) {
      for (const row of ROWS[target]) {
        expect(row.options, row.id).toEqual({});
        if (row.raises !== undefined) expect(row.raisedIn, row.id).toBe("render");
      }
    }
  });
});

for (const target of TARGETS) {
  const render = RENDERERS[target];
  const rendered = ROWS[target].filter((row) => row.expected !== undefined);
  const refused = ROWS[target].filter((row) => row.raises !== undefined);

  describe(`${target} ternary-function parity, the rows the gem renders`, () => {
    it.each(rendered.map((row) => [row.id, row] as const))(
      "%s matches the gem byte-for-byte",
      (_id, row) => {
        expect(render(build(row))).toBe(row.expected);
      },
    );
  });

  // The refusal is a RENDER refusal: every input parses. An empty list would
  // make `it.each` a no-op, so a format with none skips the block.
  if (refused.length > 0) {
    describe(`${target} ternary-function parity, the rows the gem refuses`, () => {
      it.each(refused.map((row) => [row.id, row] as const))("%s is refused too", (_id, row) => {
        const tree = build(row);
        expect(() => render(tree)).toThrow(RenderError);
      });
    });
  }
}

describe("ternary-function refusals the port keeps", () => {
  it("HTML Rule is refused with the gem's reason, not a generic gap", () => {
    const node = new TernaryFunctionNode({ name: "Rule" });
    expect(() => toHtml(node)).toThrow(RenderError);
    expect(() => toHtml(node)).toThrow(/ArgumentError/);
  });

  it("an HTML Multiscript with list scripts is refused, as the gem's lists have no to_html", () => {
    const node = new TernaryFunctionNode({
      name: "Multiscript",
      parameterTwo: [new NumberNode({ value: "1" })],
    });
    expect(() => toHtml(node)).toThrow(/a bare list|a list/);
  });

  it("an alias no fixture measures (Underover) stays refused in every format", () => {
    const node = new TernaryFunctionNode({ name: "Underover" });
    for (const target of TARGETS) {
      expect(() => RENDERERS[target](node), target).toThrow(RenderError);
    }
  });
});
