/**
 * `Math::Function::Uncertainty` (plurimath#493) against the oracle that
 * introduced it: every input in `scripts/seeds/uncertainty-inputs.json` —
 * the AsciiMath cases of plurimath's `spec/plurimath/fixtures/uncertainty/
 * contract.yml`, amath's shared-exponent corpus and the contexts and refusals
 * added here — parsed as AsciiMath, its normalized model and its six
 * renderings compared with `Plurimath::Math.parse(input, :asciimath)` on the
 * oracle recorded in the payload. `scripts/generate-uncertainty-fixtures.rb`
 * writes the payload.
 *
 * The oracle reads AsciiMath with amath; this port keeps its own grammar and
 * adds amath's `uncertainty` rule to it. The letter-fallback rows (a call that
 * is not a well-formed uncertainty form) check that both agree there too.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ParseError, RenderError } from "../../../src/core/errors";
import type { MathNode } from "../../../src/core/nodes";
import { NumberNode, UncertaintyNode, UnitsmlNode } from "../../../src/core/nodes";
import { normalize } from "../../../src/core/normalize";
import { uncertaintyMarker, uncertaintyProblem } from "../../../src/core/uncertainty";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { toAsciimath } from "../../../src/formats/asciimath/renderer";
import { toHtml } from "../../../src/formats/html/renderer";
import { toLatex } from "../../../src/formats/latex/renderer";
import { toMathml } from "../../../src/formats/mathml/renderer";
import { toOmml } from "../../../src/formats/omml/renderer";
import { toUnicodemath } from "../../../src/formats/unicodemath/renderer";

interface FixtureCase {
  readonly input: string;
  readonly error?: string;
  readonly model?: unknown;
  readonly render?: Readonly<Record<string, string | { readonly error: string }>>;
}

interface Fixture {
  readonly oracle: { readonly commit: string; readonly version: string };
  readonly count: number;
  readonly cases: readonly FixtureCase[];
}

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "uncertainty-fixtures.json"), "utf8"),
) as Fixture;

const RENDERERS: Readonly<Record<string, (node: MathNode) => string>> = {
  asciimath: (node) => toAsciimath(node),
  latex: (node) => toLatex(node),
  mathml: (node) => toMathml(node),
  omml: (node) => toOmml(node),
  unicodemath: (node) => toUnicodemath(node),
  html: (node) => toHtml(node),
};

/**
 * Renderings that depend on work outside the uncertainty port, keyed
 * `input|format`. Value: the reason.
 */
const UNIT_RULE = 'multi-letter unit as \\mup"kg" (plurimath#549), ported by plurimath-ts#205';
const KNOWN_RENDER_GAPS: ReadonlyMap<string, string> = new Map([
  ['ustd(680(41)e-3, "unitsml(kg)")|unicodemath', UNIT_RULE],
  ['ucov(1.0, 0.9, 1.1, 0.95, shortest, "unitsml(kg)")|unicodemath', UNIT_RULE],
  ['uexp(1, 0.2, 2, 0.95, "unitsml(kg)")|unicodemath', UNIT_RULE],
]);

describe("uncertainty fixtures", () => {
  it("come from an oracle with the uncertainty node", () => {
    expect(fixture.oracle.version >= "0.11.13").toBe(true);
    expect(fixture.cases.length).toBe(fixture.count);
  });

  for (const row of fixture.cases) {
    if (row.error !== undefined) {
      it(`refuses ${JSON.stringify(row.input)}`, () => {
        expect(() => parseAsciimath(row.input)).toThrow(ParseError);
      });
      continue;
    }

    describe(JSON.stringify(row.input), () => {
      it("parses to the oracle's model", () => {
        expect(normalize(parseAsciimath(row.input))).toStrictEqual(row.model);
      });
      for (const [format, expected] of Object.entries(row.render ?? {})) {
        const gap = KNOWN_RENDER_GAPS.get(`${row.input}|${format}`);
        const title = `renders ${format}${gap === undefined ? "" : ` (known gap: ${gap})`}`;
        it.skipIf(gap !== undefined)(title, () => {
          const formula = parseAsciimath(row.input);
          const render = RENDERERS[format];
          if (render === undefined) throw new Error(`no renderer for ${format}`);
          if (typeof expected === "string") expect(render(formula)).toBe(expected);
          else expect(() => render(formula)).toThrow();
        });
      }
    });
  }
});

describe("UncertaintyNode", () => {
  const number = (value: string) => new NumberNode({ value });

  it("stores notation only for the standard category", () => {
    const standard = new UncertaintyNode({
      value: number("1.0"),
      category: "standard",
      magnitude: number("0.1"),
    });
    expect(standard.notation).toBe("absolute");
    const expanded = new UncertaintyNode({
      value: number("1.0"),
      category: "expanded",
      magnitude: number("0.1"),
      coverageFactor: number("2"),
      notation: "concise",
    });
    expect(expanded.notation).toBeNull();
  });

  it("compares every field, as the gem's == does", () => {
    const make = (magnitude: string) =>
      new UncertaintyNode({
        value: number("1.0"),
        category: "standard",
        magnitude: number(magnitude),
      });
    expect(make("0.1").equals(make("0.1"))).toBe(true);
    expect(make("0.1").equals(make("0.2"))).toBe(false);
  });

  it("builds the gem's markers", () => {
    const node = new UncertaintyNode({
      value: number("9.81"),
      category: "coverage_interval",
      lower: number("9.7"),
      upper: number("9.9"),
      coverageProbability: number("0.95"),
      intervalKind: "probabilistically_symmetric",
      unit: new UnitsmlNode({ text: "m" }),
    });
    expect(uncertaintyMarker(node)).toBe(
      "coverage-interval:probabilistically-symmetric(9.81,9.7,9.9,0.95,$unit)",
    );
  });

  it.each([
    [{ category: "standard" }, "magnitude is required for a standard uncertainty"],
    [
      { category: "standard", magnitude: "0.1", coverageFactor: "2" },
      "coverage_factor does not apply to a standard uncertainty",
    ],
    [
      { category: "standard", magnitude: "0.01", notation: "concise" },
      "magnitude 0.01 cannot be written concisely after 1.0: it needs as many decimal places as the value",
    ],
    [
      { category: "expanded", magnitude: "0.1", coverageFactor: "0" },
      "coverage factor 0 must be greater than 0",
    ],
    [
      { category: "expanded", magnitude: "0.1", coverageFactor: "2", coverageProbability: "1.0" },
      "coverage probability 1.0 must lie strictly between 0 and 1",
    ],
    [
      { category: "coverage_interval", lower: "2", upper: "1.5", coverageProbability: "0.9" },
      "lower endpoint 2 is not below upper endpoint 1.5",
    ],
  ])("refuses %j as the gem's constructor does", (fields, message) => {
    const init: Record<string, unknown> = { value: number("1.0") };
    for (const [key, value] of Object.entries(fields)) {
      init[key] = key === "category" || key === "notation" ? value : number(value as string);
    }
    const node = new UncertaintyNode(init as never);
    expect(uncertaintyProblem(node)).toBe(message);
    expect(() => toLatex(node)).toThrow(RenderError);
  });
});
