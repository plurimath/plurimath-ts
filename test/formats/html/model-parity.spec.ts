/**
 * HTML parse parity against the oracle: for every fixture input,
 * normalise → grammar → transform → `normalize` must deep-equal the model the
 * gem recorded for `Plurimath::Math.parse(input, :html)`, and the normalised
 * text must match `Html::Parser#normalized_text` byte for byte.
 *
 * The fixtures are generated, never hand-written
 * (`scripts/generate-html-model-fixtures.rb`), from two sources: the round trip
 * the gem's own `to_html_round_trip_spec.rb` performs over every pinned corpus
 * case — parse, `to_html`, strip whitespace, parse back — plus a rule-coverage
 * list for the constructs that round trip never reaches.
 * `transform-coverage.spec.ts` is what proves the second list is doing its job.
 *
 * Refusals are pinned as first-class outcomes: a row with `raises` must throw
 * here too, and a row with a `model` must not.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalize, ParseError } from "../../../src/core/index";
import { parseHtml } from "../../../src/formats/html/parser";
import { preprocess } from "../../../src/formats/html/preprocess";

const HERE = dirname(fileURLToPath(import.meta.url));

interface FixtureCase {
  readonly group: string;
  readonly input: string;
  readonly normalized?: string;
  readonly model?: unknown;
  readonly raises?: string;
  readonly raisedIn?: string;
}

interface Fixtures {
  readonly schema: string;
  readonly caseCount: number;
  readonly parsedCount: number;
  readonly raisedCount: number;
  readonly corpusHtmlCount: number;
  readonly cases: readonly FixtureCase[];
}

const fixtures = JSON.parse(readFileSync(join(HERE, "model-fixtures.json"), "utf8")) as Fixtures;

const parsed = fixtures.cases.filter((entry) => entry.model !== undefined);
const raised = fixtures.cases.filter((entry) => entry.raises !== undefined);

describe("the HTML fixture set", () => {
  it("is the schema this suite reads", () => {
    expect(fixtures.schema).toBe("plurimath-corpus/html-model/1");
  });

  // A suite that quietly ran zero cases has happened in this repository before;
  // the counts are pinned so a fixture regeneration that empties a category
  // fails here rather than passing green.
  it("has the counts its header records", () => {
    expect(fixtures.cases.length).toBe(fixtures.caseCount);
    expect(parsed.length).toBe(fixtures.parsedCount);
    expect(raised.length).toBe(fixtures.raisedCount);
    expect(parsed.length + raised.length).toBe(fixtures.caseCount);
  });

  it("draws most of its inputs from the corpus's own HTML round trip", () => {
    const fromCorpus = fixtures.cases.filter((entry) => entry.group === "corpus-html");
    expect(fromCorpus.length).toBe(fixtures.corpusHtmlCount);
    expect(fromCorpus.length).toBeGreaterThan(50);
  });
});

describe("normalisation", () => {
  it.each(
    fixtures.cases
      .filter((entry) => entry.normalized !== undefined)
      .map((entry) => [entry.group, entry.input, entry] as const),
  )("%s %j: matches Html::Parser#normalized_text", (_group, _input, entry) => {
    expect(preprocess(entry.input).text).toBe(entry.normalized);
  });

  // The rows that have no `normalized` are the ones where the gem raised
  // BEFORE producing a string. Nothing else may land in that bucket, and the
  // port has to raise there too.
  it.each(
    fixtures.cases
      .filter((entry) => entry.normalized === undefined)
      .map((entry) => [entry.input, entry] as const),
  )("%j: raises where the gem's normalisation raised", (_input, entry) => {
    expect(entry.raisedIn).toBe("normalize");
    expect(() => preprocess(entry.input)).toThrow();
  });
});

describe("the parsed model", () => {
  it.each(parsed.map((entry) => [entry.group, entry.input, entry] as const))(
    "%s %j: deep-equals the gem's",
    (_group, _input, entry) => {
      expect(normalize(parseHtml(entry.input))).toStrictEqual(entry.model);
    },
  );
});

describe("the inputs the gem refuses", () => {
  it.each(raised.map((entry) => [entry.group, entry.input, entry] as const))(
    "%s %j: is refused here too",
    (_group, _input, entry) => {
      // Every refusal reaches `Plurimath::Math.parse`'s boundary as a
      // `ParseError`, whichever stage raised — including the normalisation
      // `RangeError`, which `math.rb:47` funnels into one. `parseHtml` stands
      // at the same boundary, so the type is required on every row rather than
      // only on the `raisedIn: "parse"` ones.
      expect(entry.raises).toBe("Plurimath::Math::ParseError");
      expect(() => parseHtml(entry.input)).toThrow(ParseError);
    },
  );
});
