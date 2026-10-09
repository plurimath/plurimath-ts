/**
 * Parity for MathML input (`parseMathml`) against the gem's
 * `Plurimath::Math.parse(text, :mathml)`, on every row of `./model-fixtures.json`:
 * the pinned corpus's MathML cases and the dispatch probes. A parsed row must
 * deep-equal the gem's model; a refused row must be refused.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalize, ParseError } from "../../../src/core/index";
import { MmlParseError, parseMml } from "../../../src/formats/mathml/mml";
import { parseMathml } from "../../../src/formats/mathml/parser";
import { MathmlTranslateError, translateMml } from "../../../src/formats/mathml/translator";

interface Row {
  readonly id: string;
  readonly group: string;
  readonly input: string;
  readonly model?: unknown;
  readonly raises?: string;
  readonly raisedIn?: string;
}

const FIXTURE = JSON.parse(
  readFileSync(new URL("./model-fixtures.json", import.meta.url), "utf8"),
) as {
  readonly schema: string;
  readonly caseCount: number;
  readonly parsedCount: number;
  readonly raisedCount: number;
  readonly corpusMathmlCount: number;
  readonly cases: readonly Row[];
};

const parsed = FIXTURE.cases.filter((row) => row.model !== undefined);
const raised = FIXTURE.cases.filter((row) => row.raises !== undefined);

describe("the MathML fixture set", () => {
  it("is the schema this suite reads, with the counts its header records", () => {
    expect(FIXTURE.schema).toBe("plurimath-corpus/mathml-model/1");
    expect(FIXTURE.cases.length).toBe(FIXTURE.caseCount);
    expect(parsed.length).toBe(FIXTURE.parsedCount);
    expect(raised.length).toBe(FIXTURE.raisedCount);
  });

  it("draws its inputs from the pinned corpus and has both outcomes", () => {
    const corpus = FIXTURE.cases.filter((row) => row.group === "corpus-mathml");
    expect(corpus.length).toBe(FIXTURE.corpusMathmlCount);
    expect(corpus.length).toBeGreaterThan(250);
    expect(parsed.length).toBeGreaterThan(0);
    expect(raised.length).toBeGreaterThan(0);
    expect(raised.some((row) => row.raisedIn === "translate")).toBe(true);
  });
});

describe("the parsed model", () => {
  it.each(parsed.map((row) => [row.group, row.id, row] as const))(
    "%s %s: deep-equals the gem's",
    (_group, _id, row) => {
      expect(normalize(parseMathml(row.input))).toStrictEqual(row.model);
    },
  );
});

describe("the inputs the gem refuses", () => {
  it.each(raised.map((row) => [row.group, row.id, row] as const))(
    "%s %s: is refused here too",
    (_group, _id, row) => {
      expect(() => parseMathml(row.input)).toThrow(ParseError);
      // The same half refuses as in the gem: the XML read, or the translation.
      if (row.raisedIn === "mml") expect(() => parseMml(row.input)).toThrow(MmlParseError);
      else {
        const tree = parseMml(row.input);
        expect(() => translateMml(tree, row.input)).toThrow(MathmlTranslateError);
      }
    },
  );
});
