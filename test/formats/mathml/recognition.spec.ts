import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ParseError } from "../../../src/core/index";
import { toAsciimath } from "../../../src/formats/asciimath/renderer";
import {
  MATHML_RECOGNIZED_ELEMENT_COUNT,
  MATHML_RECOGNIZED_ELEMENTS,
} from "../../../src/formats/mathml/generated-recognition/elements";
import { parseMml } from "../../../src/formats/mathml/mml";
import { parseMathml } from "../../../src/formats/mathml/parser";

interface Probe {
  readonly name: string;
  readonly input: string;
  readonly parsed: boolean;
  readonly asciimath?: string;
}
const directory = "../../../src/formats/mathml/generated-recognition/";
const probes = JSON.parse(
  readFileSync(new URL(`${directory}context-probes.json`, import.meta.url), "utf8"),
) as readonly Probe[];
const provenance = JSON.parse(
  readFileSync(new URL(`${directory}provenance.json`, import.meta.url), "utf8"),
) as { verifiedMappings: number; verifiedContextProbes: number };

describe("runtime MathML recognition", () => {
  it("contains every generated mapping and both parser outcomes", () => {
    expect(MATHML_RECOGNIZED_ELEMENTS.size).toBe(MATHML_RECOGNIZED_ELEMENT_COUNT);
    expect(MATHML_RECOGNIZED_ELEMENT_COUNT).toBe(provenance.verifiedMappings);
    expect(MATHML_RECOGNIZED_ELEMENT_COUNT).toBeGreaterThan(100);
    expect(probes.length).toBe(provenance.verifiedContextProbes);
    expect(probes.some((row) => row.parsed)).toBe(true);
    expect(probes.some((row) => !row.parsed)).toBe(true);
  });

  it.each(["pi", "apply"])("retains the measured %s kind until translation", (element) => {
    const tree = parseMml(`<math><${element}/></math>`);
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]).toMatchObject({ kind: MATHML_RECOGNIZED_ELEMENTS.get(element) });
  });

  it.each(probes)("matches the public Ruby parser: $name", (row) => {
    if (row.parsed) {
      expect(toAsciimath(parseMathml(row.input))).toBe(row.asciimath);
    } else {
      expect(() => parseMathml(row.input)).toThrow(ParseError);
    }
  });
});
