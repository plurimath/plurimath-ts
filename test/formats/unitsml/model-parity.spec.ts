import { describe, expect, it } from "vitest";
import { normalize, ParseError, RenderError } from "../../../src/core/index";
import { type TokenRecord, UNITSML_DATA } from "../../../src/unitsml/data";
import {
  expandUnitsml,
  unitsmlAsciimath,
  unitsmlMathml,
  unitsmlXml,
  validateUnitsml,
} from "../../../src/unitsml/index";

const records = [
  ...Object.entries(UNITSML_DATA.units).map(([id, row]) => [`unit:${id}`, row] as const),
  ...Object.entries(UNITSML_DATA.prefixes).map(([id, row]) => [`prefix:${id}`, row] as const),
  ...Object.entries(UNITSML_DATA.dimensions).map(([id, row]) => [`dimension:${id}`, row] as const),
  ...Object.entries(UNITSML_DATA.prefixedUnits).map(([id, row]) => [`pair:${id}`, row] as const),
  ...Object.entries(UNITSML_DATA.special ?? {}).map(([id, row]) => [`special:${id}`, row] as const),
];
const compact = (xml: string): string => xml.replace(/>\s+</g, "><").trim();

describe("the pinned Unitsml0.6.8 measured token export", () => {
  it("has nonempty tokens, native templates, and recorded refusals", () => {
    for (const tokens of Object.values(UNITSML_DATA.tokens))
      expect(tokens.length).toBeGreaterThan(0);
    expect(records.some(([, row]) => row.model !== undefined)).toBe(true);
    expect(
      records.some(([, row]) => row.raises !== undefined || row.modelError !== undefined),
    ).toBe(true);
  });

  it.each(records)(
    "%s eager construction matches the reference acceptance",
    (_id, row: TokenRecord) => {
      if (row.raises !== undefined) expect(() => validateUnitsml(row.input)).toThrow(ParseError);
      else expect(() => validateUnitsml(row.input)).not.toThrow();
    },
  );

  it.each(records)(
    "%s native expansion matches the reference model or refusal",
    (_id, row: TokenRecord) => {
      if (row.raises !== undefined) expect(() => expandUnitsml(row.input)).toThrow(ParseError);
      else if (row.modelError !== undefined)
        expect(() => expandUnitsml(row.input)).toThrow(RenderError);
      else {
        expect(row.model).toBeDefined();
        expect(normalize(expandUnitsml(row.input))).toStrictEqual(row.model);
      }
    },
  );

  it.each(records)("%s dependency AsciiMath output matches or refuses", (_id, row: TokenRecord) => {
    if (row.raises !== undefined) expect(() => unitsmlAsciimath(row.input)).toThrow(ParseError);
    else if (row.asciiError !== undefined)
      expect(() => unitsmlAsciimath(row.input)).toThrow(RenderError);
    else expect(unitsmlAsciimath(row.input)).toBe(row.ascii);
  });

  it.each(records)("%s dependency MathML structure matches or refuses", (_id, row: TokenRecord) => {
    if (row.raises !== undefined) expect(() => unitsmlMathml(row.input)).toThrow(ParseError);
    else if (row.mathmlError !== undefined)
      expect(() => unitsmlMathml(row.input)).toThrow(RenderError);
    else {
      expect(row.mathml).toBeDefined();
      expect(compact(unitsmlMathml(row.input))).toBe(compact(row.mathml as string));
    }
  });

  it.each(records)("%s dependency XML bytes match or refuse", (_id, row: TokenRecord) => {
    if (row.raises !== undefined) expect(() => unitsmlXml(row.input)).toThrow(ParseError);
    else if (row.xmlError !== undefined) expect(() => unitsmlXml(row.input)).toThrow(RenderError);
    else expect(unitsmlXml(row.input)).toBe(row.xml);
  });
});
