/**
 * Differential model parity beyond the corpus (TODO.plan p1/05): the grammar's
 * two sweeps (`failure-parity.spec.ts`) carried through the transform. For
 * every input, preprocess → grammar → transform → `normalize` must deep-equal
 * the model the gem recorded for `Plurimath::Math.parse(input, :asciimath)`,
 * and every input the gem refuses must be refused here as a `ParseError`.
 *
 * The fixture is generated, never hand-written
 * (`scripts/generate-asciimath-model-fixtures.rb`): every string of length 1-3
 * over the sweep alphabet; 200 seeded inputs of 4-26 characters over the same
 * alphabet plus whole keywords, in the shape of the grammar sweep's 1,500
 * (a one-off probe, not committed); and the pinned corpus's AsciiMath inputs.
 *
 * Divergences are collected and reported together rather than one test per
 * row: six thousand `it.each` rows cost more in reporter overhead than the
 * comparisons themselves, and a list of every divergent input is what a
 * failure here needs to show.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { normalize, ParseError } from "../../../src/core/index";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { preprocess } from "../../../src/formats/asciimath/preprocess";

const HERE = dirname(fileURLToPath(import.meta.url));

interface FixtureCase {
  readonly id: string;
  readonly group: string;
  readonly input: string;
  readonly preprocessed?: string;
  readonly model?: unknown;
  readonly raises?: string;
  readonly raisedIn?: string;
}

interface Fixtures {
  readonly schema: string;
  readonly caseCount: number;
  readonly parsedCount: number;
  readonly raisedCount: number;
  readonly corpusAsciimathCount: number;
  readonly cases: readonly FixtureCase[];
}

const fixtures = JSON.parse(readFileSync(join(HERE, "model-fixtures.json"), "utf8")) as Fixtures;

const parsed = fixtures.cases.filter((entry) => entry.model !== undefined);
const raised = fixtures.cases.filter((entry) => entry.raises !== undefined);

function inGroup(group: string): readonly FixtureCase[] {
  return fixtures.cases.filter((entry) => entry.group === group);
}

describe("the AsciiMath model sweep fixture", () => {
  it("is the schema this suite reads", () => {
    expect(fixtures.schema).toBe("plurimath-corpus/asciimath-model/1");
  });

  it("has the counts its header records", () => {
    expect(fixtures.cases.length).toBe(fixtures.caseCount);
    expect(parsed.length).toBe(fixtures.parsedCount);
    expect(raised.length).toBe(fixtures.raisedCount);
    expect(parsed.length + raised.length).toBe(fixtures.caseCount);
  });

  // Literal floors, so a regeneration that empties a group and rewrites the
  // header to match cannot pass. The short sweep is the whole space of length
  // 1-3 over sixteen characters, less the inputs the corpus already carries.
  it("carries both sweeps and the corpus, at their measured sizes", () => {
    expect(inGroup("corpus-asciimath").length).toBe(fixtures.corpusAsciimathCount);
    expect(inGroup("corpus-asciimath").length).toBeGreaterThan(50);
    expect(inGroup("sweep-short").length + inGroup("corpus-asciimath").filter((entry) => [...entry.input].length <= 3).length).toBeGreaterThanOrEqual(4368);
    expect(inGroup("sweep-long").length).toBe(200);
    expect(parsed.length).toBeGreaterThan(0);
    expect(raised.length).toBeGreaterThan(0);
  });
});

describe("the AsciiMath model sweep", () => {
  it("preprocesses every input as Asciimath::Parser#text does", () => {
    const divergences = fixtures.cases
      .filter((entry) => preprocess(entry.input).text !== entry.preprocessed)
      .map((entry) => JSON.stringify(entry.input));
    expect(divergences).toEqual([]);
  });

  it("deep-equals the gem's model for every input the gem accepts", () => {
    const divergences: string[] = [];
    for (const entry of parsed) {
      let actual: unknown;
      try {
        actual = normalize(parseAsciimath(entry.input));
      } catch (error) {
        divergences.push(`${entry.group} ${JSON.stringify(entry.input)}: threw ${String(error)}`);
        continue;
      }
      if (!isDeepStrictEqual(actual, entry.model)) {
        divergences.push(`${entry.group} ${JSON.stringify(entry.input)}: model differs`);
      }
    }
    expect(divergences).toEqual([]);
  }, 120_000);

  it("refuses, with ParseError, every input the gem refuses", () => {
    const divergences: string[] = [];
    for (const entry of raised) {
      try {
        parseAsciimath(entry.input);
        divergences.push(`${entry.group} ${JSON.stringify(entry.input)}: parsed`);
      } catch (error) {
        if (!(error instanceof ParseError)) {
          divergences.push(`${entry.group} ${JSON.stringify(entry.input)}: threw ${String(error)}`);
        }
      }
    }
    expect(divergences).toEqual([]);
  }, 120_000);
});
