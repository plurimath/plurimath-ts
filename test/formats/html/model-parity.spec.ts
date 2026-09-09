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

/**
 * The shapes the GEM's own transform leaves unmatched, RE-DERIVED here from the
 * gem's recorded models rather than read from anywhere.
 *
 * This is an observation, not a gate. Nothing refuses on it: the transform
 * keeps an unmatched hash exactly as the gem does, and what actually holds the
 * port to the gem is the deep-equality above, which compares against the model
 * the gem produced. Recording the set still earns its place — it says out loud
 * which constructs the gem answers with a raw hash, and it fails if a fixture
 * regeneration changes that set without anyone noticing.
 */
const GEM_UNMATCHED_SIGNATURES: readonly string[] = [
  "binary=simple,first_value=sequence,second_value=simple,sequence=simple",
  "binary_number=simple,expression=sequence",
  "binary_number=simple,expression=simple",
  "binary_number=simple,parse_parenthesis=simple",
  "expression=other,sub_sup=simple,sub_value=sequence,sup_value=simple",
  "expression=other,symbol=simple",
  "expression=sequence,hex_number=simple",
  "expression=sequence,octal_number=simple",
  "expression=sequence,sequence=sequence",
  "expression=sequence,sum_prod=simple",
  "expression=simple,hex_number=simple",
  "expression=simple,lparen=simple,rparen=simple,sequence=simple",
  "expression=simple,octal_number=simple",
  "expression=simple,sum_prod=simple",
  "expression=simple,tr_value=sequence",
  "first_value=sequence,unary=simple",
  "hex_number=simple,parse_parenthesis=simple",
  "number=simple,parse_parenthesis=simple",
  "octal_number=simple,parse_parenthesis=simple",
  "parse_parenthesis=other",
  "parse_parenthesis=simple,sequence=sequence",
  "parse_parenthesis=simple,td_value=simple",
  "parse_parenthesis=simple,tr_value=simple",
  "sequence=other",
  "sub_sup=other,sup_value=simple",
  "sub_sup=sequence,sub_value=sequence",
  "sub_sup=sequence,sub_value=simple",
  "sub_sup=sequence,sub_value=simple,sup_value=simple",
  "sub_sup=sequence,sup_value=sequence",
  "sub_sup=sequence,sup_value=simple",
  "table_value=other",
  "unary_function=other",
];

describe("the signatures the gem leaves unmatched", () => {
  const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

  // A serialized node is `{class, fields}` and stands for a real model object,
  // so it is a LEAF here — the same thing `shapeOf` sees when the transform
  // hands it a draft rather than a plain hash.
  const isSerializedNode = (value: unknown): boolean =>
    isPlainObject(value) &&
    Object.keys(value).length === 2 &&
    "class" in value &&
    "fields" in value;

  const isRawHash = (value: unknown): boolean => isPlainObject(value) && !isSerializedNode(value);

  const serializedShapeOf = (value: unknown): "simple" | "sequence" | "other" => {
    if (Array.isArray(value)) {
      return value.every((item) => !Array.isArray(item) && !isRawHash(item)) ? "sequence" : "other";
    }
    return isRawHash(value) ? "other" : "simple";
  };

  const signatureOf = (hash: Record<string, unknown>): string =>
    Object.entries(hash)
      .map(([key, value]) => `${key}=${serializedShapeOf(value)}`)
      .sort()
      .join(",");

  const measured = new Set<string>();
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) collect(item);
      return;
    }
    if (!isPlainObject(value)) return;
    if (isSerializedNode(value)) {
      for (const field of Object.values(value.fields as Record<string, unknown>)) collect(field);
      return;
    }
    // The only EMPTY hashes in these models are `Math::Function::Table#options`
    // and `Math::Function::Linebreak#attributes` — model fields that happen to
    // hold a Hash, not Parslet nodes that failed to match. A node that failed
    // to match always carries at least the key it was captured under.
    if (Object.keys(value).length > 0) measured.add(signatureOf(value));
    for (const entry of Object.values(value)) collect(entry);
  };
  for (const entry of parsed) collect(entry.model);

  it("found some, so this check is not passing on an empty walk", () => {
    expect(measured.size).toBeGreaterThan(20);
  });

  it("is exactly the set recorded above", () => {
    expect([...measured].sort()).toStrictEqual([...GEM_UNMATCHED_SIGNATURES].sort());
  });
});
