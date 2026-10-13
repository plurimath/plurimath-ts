/**
 * Parity for OMML input (`parseOmml`) against the gem's
 * `Plurimath::Math.parse(text, :omml)`, on every row of `./model-fixtures.json`:
 * the pinned corpus's OMML cases and the coverage probes. A parsed row must
 * deep-equal the gem's model; a refused row must be refused.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalize, ParseError } from "../../../src/core/index";
import { parseOmml } from "../../../src/formats/omml/index";
import { OmmlParseError, parseOmmlDocument } from "../../../src/formats/omml/omml-input";
import { OmmlTranslateError, translateOmml } from "../../../src/formats/omml/translator";

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
  readonly corpusOmmlCount: number;
  readonly cases: readonly Row[];
};

const parsed = FIXTURE.cases.filter((row) => row.model !== undefined);
const raised = FIXTURE.cases.filter((row) => row.raises !== undefined);

describe("the OMML fixture set", () => {
  it("is the schema this suite reads, with the counts its header records", () => {
    expect(FIXTURE.schema).toBe("plurimath-corpus/omml-model/1");
    expect(FIXTURE.cases.length).toBe(FIXTURE.caseCount);
    expect(parsed.length).toBe(FIXTURE.parsedCount);
    expect(raised.length).toBe(FIXTURE.raisedCount);
  });

  it("draws its inputs from the pinned corpus and has both outcomes", () => {
    const corpus = FIXTURE.cases.filter((row) => row.group === "corpus-omml");
    expect(corpus.length).toBe(FIXTURE.corpusOmmlCount);
    expect(corpus.length).toBeGreaterThan(150);
    expect(parsed.length).toBeGreaterThan(0);
    expect(raised.length).toBeGreaterThan(0);
    expect(raised.some((row) => row.raisedIn === "translate")).toBe(true);
  });
});

describe("the parsed model", () => {
  it.each(parsed.map((row) => [row.group, row.id, row] as const))(
    "%s %s: deep-equals the gem's",
    (_group, _id, row) => {
      expect(normalize(parseOmml(row.input))).toStrictEqual(row.model);
    },
  );
});

describe("the inputs the gem refuses", () => {
  it.each(raised.map((row) => [row.group, row.id, row] as const))(
    "%s %s: is refused here too",
    (_group, _id, row) => {
      expect(() => parseOmml(row.input)).toThrow(ParseError);
      // The same half refuses as in the gem: the XML read, or the translation.
      if (row.raisedIn === "omml") {
        expect(() => parseOmmlDocument(row.input)).toThrow(OmmlParseError);
      } else {
        const tree = parseOmmlDocument(row.input);
        expect(() => translateOmml(tree, row.input)).toThrow(OmmlTranslateError);
      }
    },
  );
});
