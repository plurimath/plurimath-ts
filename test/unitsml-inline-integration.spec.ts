import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import Plurimath from "../src/compat/index";
import { ParseError, RenderError } from "../src/core/index";
import { parseAsciimath, toAsciimath } from "../src/formats/asciimath/index";
import { toHtml } from "../src/formats/html/index";
import { toLatex } from "../src/formats/latex/index";
import { toMathml } from "../src/formats/mathml/index";
import { toOmml } from "../src/formats/omml/index";
import { toUnicodemath } from "../src/formats/unicodemath/index";
import { parse } from "../src/parse";
import type { UnitsmlRenderOptions } from "../src/unitsml/index";

interface Outcome {
  readonly value?: string;
  readonly raises?: string;
}
interface InlineRow {
  readonly input: string;
  readonly parseInput: string;
  readonly parseFormat: "asciimath";
  readonly options: Readonly<Record<string, unknown>>;
  readonly optionsTypes: Readonly<Record<string, string>>;
  readonly raises?: string;
  readonly renders?: Readonly<Record<string, Outcome>>;
}
const fixture = JSON.parse(
  readFileSync(new URL("./formats/unitsml/probe-fixtures.json", import.meta.url), "utf8"),
) as {
  readonly schema: string;
  readonly cases: readonly { readonly input: string; readonly raises?: string }[];
  readonly plurimathInlineCases: readonly InlineRow[];
};

function unitOptions(row: InlineRow): UnitsmlRenderOptions {
  return Object.fromEntries(
    Object.entries(row.options).map(([key, value]) => [
      key === "explicit_parenthesis" ? "explicitParenthesis" : key,
      row.optionsTypes[key] === "symbol" ? Symbol.for(String(value)) : value,
    ]),
  ) as UnitsmlRenderOptions;
}

const RENDERERS = {
  asciimath: toAsciimath,
  latex: toLatex,
  mathml: toMathml,
  html: toHtml,
  omml: toOmml,
  unicodemath: toUnicodemath,
};

describe("inline UnitsML against the measured Plurimath pipeline", () => {
  it("loads a nonempty six-format probe with symbol options", () => {
    expect(fixture.schema).toBe("plurimath-unitsml-probe/1");
    expect(fixture.plurimathInlineCases.length).toBeGreaterThan(0);
    expect(
      fixture.plurimathInlineCases.some((row) => row.optionsTypes.multiplier === "symbol"),
    ).toBe(true);
    for (const row of fixture.plurimathInlineCases) {
      if (row.raises === undefined)
        expect(Object.keys(row.renders ?? {}).sort()).toEqual(Object.keys(RENDERERS).sort());
    }
  });

  for (const [format, render] of Object.entries(RENDERERS)) {
    it.each(fixture.plurimathInlineCases)(
      `$input ($options): ${format} matches output or refusal`,
      (row) => {
        if (row.raises !== undefined) {
          expect(() => parseAsciimath(row.parseInput)).toThrow(ParseError);
          return;
        }
        const result = row.renders?.[format];
        expect(result, `${row.input}: missing measured ${format} outcome`).toBeDefined();
        const formula = parseAsciimath(row.parseInput);
        if (result?.raises !== undefined)
          expect(() => render(formula, { unitsml: unitOptions(row) })).toThrow(RenderError);
        else expect(render(formula, { unitsml: unitOptions(row) })).toBe(result?.value);
      },
    );
  }

  it("retains outer caller context for measured invalid unit expressions", () => {
    const refusals = fixture.cases.filter((row) => row.raises !== undefined);
    expect(refusals.length).toBeGreaterThan(0);
    for (const row of refusals) {
      const input = `"unitsml(${row.input})"`;
      try {
        parseAsciimath(input);
        throw new Error(`${row.input}: invalid unit expression parsed`);
      } catch (error) {
        expect(error).toBeInstanceOf(ParseError);
        expect(error).toMatchObject({ input, format: "asciimath" });
      }
    }
  });

  it("keeps the standalone reference failure distinct from inline support", () => {
    for (const run of [
      () => parse("kg", "unitsml" as never),
      () => new Plurimath("kg", "unitsml" as never),
    ]) {
      expect(run).toThrow(ParseError);
      try {
        run();
      } catch (error) {
        expect(error).toMatchObject({ input: "kg", format: "unitsml" });
      }
    }
  });
});
