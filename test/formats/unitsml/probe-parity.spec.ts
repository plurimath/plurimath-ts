import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalize, ParseError, RenderError } from "../../../src/core/index";
import type { TokenRecord } from "../../../src/unitsml/data";
import {
  expandUnitsml,
  type UnitsmlRenderOptions,
  unitsmlAsciimath,
  unitsmlMathml,
  unitsmlXml,
  validateUnitsml,
} from "../../../src/unitsml/index";

interface Probe extends TokenRecord {
  readonly options: Readonly<Record<string, unknown>>;
  readonly optionsTypes?: Readonly<Record<string, string>>;
}
const fixture = JSON.parse(
  readFileSync(new URL("./probe-fixtures.json", import.meta.url), "utf8"),
) as { readonly schema: string; readonly cases: readonly Probe[] };

function options(row: Probe): UnitsmlRenderOptions {
  return Object.fromEntries(
    Object.entries(row.options).map(([key, value]) => [
      key === "explicit_parenthesis" ? "explicitParenthesis" : key,
      row.optionsTypes?.[key] === "symbol" ? Symbol.for(String(value)) : value,
    ]),
  ) as UnitsmlRenderOptions;
}

describe("UnitsML expression and render-option probes on the pinned dependency", () => {
  it("contains acceptances, parse refusals, and render refusals", () => {
    expect(fixture.schema).toBe("plurimath-unitsml-probe/1");
    expect(fixture.cases.some((row) => row.model !== undefined)).toBe(true);
    expect(fixture.cases.some((row) => row.raises !== undefined)).toBe(true);
    expect(fixture.cases.some((row) => row.modelError !== undefined)).toBe(true);
    expect(fixture.cases.some((row) => row.optionsTypes?.multiplier === "symbol")).toBe(true);
    expect(fixture.cases.some((row) => row.optionsTypes?.multiplier === "string")).toBe(true);
  });

  it.each(fixture.cases)("$input ($options): eager construction preserves acceptance", (row) => {
    if (row.raises !== undefined) expect(() => validateUnitsml(row.input)).toThrow(ParseError);
    else expect(() => validateUnitsml(row.input)).not.toThrow();
  });

  it.each(fixture.cases)("$input ($options): expansion preserves the full native model", (row) => {
    if (row.raises !== undefined)
      expect(() => expandUnitsml(row.input, options(row))).toThrow(ParseError);
    else if (row.modelError !== undefined)
      expect(() => expandUnitsml(row.input, options(row))).toThrow(RenderError);
    else expect(normalize(expandUnitsml(row.input, options(row)))).toStrictEqual(row.model);
  });

  for (const [channel, convert] of [
    ["ascii", unitsmlAsciimath],
    ["mathml", unitsmlMathml],
    ["xml", unitsmlXml],
  ] as const) {
    it.each(fixture.cases)(
      `$input ($options): ${channel} bytes preserve output or refusal`,
      (row) => {
        if (row.raises !== undefined)
          expect(() => convert(row.input, options(row))).toThrow(ParseError);
        else if (row[`${channel}Error`] !== undefined)
          expect(() => convert(row.input, options(row))).toThrow(RenderError);
        else expect(convert(row.input, options(row))).toBe(row[channel]);
      },
    );
  }
});
