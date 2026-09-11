/**
 * LaTeX parse parity against the oracle: for every fixture input,
 * preprocess → grammar → transform → `normalize` must deep-equal the model the
 * gem recorded for `Plurimath::Math.parse(input, :latex)`, and the preprocessed
 * text must match `Latex::Parser.new(input).text` byte for byte.
 *
 * The fixtures are generated, never hand-written
 * (`scripts/generate-latex-model-fixtures.rb`), from two sources: every
 * distinct `expected.latex` string in the pinned corpus — LaTeX the gem itself
 * emitted, fed back in as a round trip — plus a rule-coverage list for the
 * constructs the corpus never reaches. `transform-coverage.spec.ts` is what
 * proves the second list is doing its job.
 *
 * Refusals are pinned as first-class outcomes: a row with `raises` must throw
 * here too, and a row with a `model` must not.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalize, ParseError } from "../../../src/core/index";
import { parseLatex } from "../../../src/formats/latex/parser";
import { preprocess } from "../../../src/formats/latex/preprocess";

const HERE = dirname(fileURLToPath(import.meta.url));

interface FixtureCase {
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
  readonly corpusLatexCount: number;
  readonly cases: readonly FixtureCase[];
}

const fixtures = JSON.parse(readFileSync(join(HERE, "model-fixtures.json"), "utf8")) as Fixtures;

const parsed = fixtures.cases.filter((entry) => entry.model !== undefined);
const raised = fixtures.cases.filter((entry) => entry.raises !== undefined);

describe("the LaTeX fixture set", () => {
  it("is the schema this suite reads", () => {
    expect(fixtures.schema).toBe("plurimath-corpus/latex-model/1");
  });

  // A suite that quietly ran zero cases has happened in this repository before.
  // This test alone does NOT catch that, and used to claim it did: every
  // assertion here compares the payload against the payload's OWN header, so a
  // regeneration that empties a category and writes the matching zero into the
  // header passes all four. Measured on a constructed payload with `raised`
  // emptied to 0 and `raisedCount` set to 0: green.
  //
  // What it does catch is DRIFT — a header count computed by a different path
  // from the array it describes. The emptying attack is caught by the literal
  // floors below, by `fromCorpus.length > 50`, and, for `parsed`, by the
  // generator's own `abort "REFUSING: zero rows parsed"`
  // (`scripts/generate-latex-model-fixtures.rb`). Nothing guarded `raised`
  // until the second test here.
  it("has the counts its header records", () => {
    expect(fixtures.cases.length).toBe(fixtures.caseCount);
    expect(parsed.length).toBe(fixtures.parsedCount);
    expect(raised.length).toBe(fixtures.raisedCount);
    expect(parsed.length + raised.length).toBe(fixtures.caseCount);
  });

  it("actually has both categories, not merely header counts that say so", () => {
    expect(parsed.length).toBeGreaterThan(0);
    expect(raised.length).toBeGreaterThan(0);
  });

  it("draws most of its inputs from the pinned corpus's own LaTeX output", () => {
    const fromCorpus = fixtures.cases.filter((entry) => entry.group === "corpus-latex");
    expect(fromCorpus.length).toBe(fixtures.corpusLatexCount);
    expect(fromCorpus.length).toBeGreaterThan(50);
  });
});

describe("preprocessing", () => {
  it.each(
    fixtures.cases
      .filter((entry) => entry.preprocessed !== undefined)
      .map((entry) => [entry.group, entry.input, entry] as const),
  )("%s %j: matches Latex::Parser#text", (_group, _input, entry) => {
    expect(preprocess(entry.input).text).toBe(entry.preprocessed);
  });
});

describe("the parsed model", () => {
  it.each(parsed.map((entry) => [entry.group, entry.input, entry] as const))(
    "%s %j: deep-equals the gem's",
    (_group, _input, entry) => {
      expect(normalize(parseLatex(entry.input))).toStrictEqual(entry.model);
    },
  );
});

describe("the inputs the gem refuses", () => {
  it.each(raised.map((entry) => [entry.group, entry.input, entry] as const))(
    "%s %j: is refused here too",
    (_group, _input, entry) => {
      expect(() => parseLatex(entry.input)).toThrow();
      // Every `Plurimath::Math::ParseError` row is a parse refusal, and this
      // port's boundary raises `ParseError` for exactly those. A row that
      // raised somewhere else (`raisedIn: "preprocess"`) is a different
      // failure and is only required to throw.
      if (entry.raises === "Plurimath::Math::ParseError" && entry.raisedIn === "parse") {
        expect(() => parseLatex(entry.input)).toThrow(ParseError);
      }
    },
  );
});
