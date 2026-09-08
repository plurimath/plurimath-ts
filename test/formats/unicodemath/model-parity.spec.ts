/**
 * UnicodeMath parse parity against the oracle: for every fixture input, the
 * gem's own preprocessed text → grammar → transform → `normalize` must
 * deep-equal the model the gem recorded for
 * `Plurimath::Math.parse(input, :unicode)`.
 *
 * The fixtures are generated, never hand-written
 * (`scripts/generate-unicodemath-model-fixtures.rb`), from one source: every
 * distinct `expected.unicodemath` string in the pinned corpus — UnicodeMath the
 * gem itself emitted, fed back in as a round trip.
 *
 * **The preprocessed text comes from the fixture, not from this port.**
 * `UnicodeMath::Parser#initialize` entity-encodes its input, reverses five
 * specific encodings, rewrites `\uXXXX` escapes and strips the result before
 * Parslet ever runs. That pass is a separate slice — `grammar.spec.ts` already
 * reads its inputs the same way — so this suite starts where the grammar does.
 *
 * Refusals are pinned as first-class outcomes: a row with `raises` must fail
 * here too, and a row with a `model` must not — except the rows whose rule
 * family this slice defers, which are listed below and must fail LOUDLY.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalize } from "../../../src/core/index";
import { parseUnicodemathPreprocessed } from "../../../src/formats/unicodemath/grammar";
import {
  finalizeUnicodemathParse,
  unicodemathTransform,
} from "../../../src/formats/unicodemath/transform";

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
  readonly corpusUnicodemathCount: number;
  readonly cases: readonly FixtureCase[];
}

const fixtures = JSON.parse(readFileSync(join(HERE, "model-fixtures.json"), "utf8")) as Fixtures;

/**
 * The two corpus inputs whose rules this slice defers.
 *
 * `transform.rb`'s table/matrix family — the eight rules `:8`, `:9`, `:14`,
 * `:32`, `:1569`, `:1574`, `:1584` and `:1649` — is the one family the corpus
 * reaches that the port leaves out, and these are exactly the inputs that reach
 * it (measured on the oracle: no other corpus string fires any of the eight).
 *
 * They are listed here rather than dropped from the fixture set, because the
 * fixture set is the ORACLE's answer and stays complete. What is asserted is
 * that the port REFUSES them: with those rules absent the `matrixs`/`tr`/`td`
 * nodes reach `finalize` as plain hashes and it throws, naming the keys. When
 * the family lands, these two move from this list into the parity list and the
 * count below fails until they do.
 */
const DEFERRED_INPUTS: readonly string[] = ["⒨(a@b)", "ⓢ(a&b@c&d)"];

const parsed = fixtures.cases.filter((entry) => entry.model !== undefined);
const raised = fixtures.cases.filter((entry) => entry.raises !== undefined);
const deferred = parsed.filter((entry) => DEFERRED_INPUTS.includes(entry.input));
const supported = parsed.filter((entry) => !DEFERRED_INPUTS.includes(entry.input));

function parseFixture(entry: FixtureCase): unknown {
  const preprocessed = entry.preprocessed;
  if (preprocessed === undefined) throw new Error("fixture row has no preprocessed text");
  const tree = parseUnicodemathPreprocessed(preprocessed);
  return finalizeUnicodemathParse(unicodemathTransform().apply(tree), entry.input);
}

describe("the UnicodeMath fixture set", () => {
  it("is the schema this suite reads", () => {
    expect(fixtures.schema).toBe("plurimath-corpus/unicodemath-model/1");
  });

  // A suite that quietly ran zero cases has happened in this repository before;
  // the counts are pinned so a fixture regeneration that empties a category
  // fails here rather than passing green.
  it("has the counts its header records", () => {
    expect(fixtures.cases.length).toBe(fixtures.caseCount);
    expect(parsed.length).toBe(fixtures.parsedCount);
    expect(raised.length).toBe(fixtures.raisedCount);
    expect(parsed.length + raised.length).toBe(fixtures.caseCount);
    expect(fixtures.corpusUnicodemathCount).toBe(fixtures.caseCount);
  });

  it("draws every input from the pinned corpus's own UnicodeMath output", () => {
    expect(fixtures.cases.every((entry) => entry.group === "corpus-unicodemath")).toBe(true);
    expect(fixtures.cases.length).toBeGreaterThan(50);
  });

  it("defers exactly the two inputs the table/matrix family serves", () => {
    expect(deferred.length).toBe(DEFERRED_INPUTS.length);
    expect(supported.length).toBe(parsed.length - DEFERRED_INPUTS.length);
    expect(supported.length).toBeGreaterThan(90);
  });
});

describe("the parsed model", () => {
  it.each(supported.map((entry) => [entry.input, entry] as const))(
    "%j: deep-equals the gem's",
    (_input, entry) => {
      expect(normalize(parseFixture(entry) as never)).toStrictEqual(entry.model);
    },
  );
});

describe("the rule families this slice defers", () => {
  it.each(deferred.map((entry) => [entry.input, entry] as const))(
    "%j: refuses loudly, naming the unmatched keys",
    (_input, entry) => {
      expect(() => parseFixture(entry)).toThrow(/no rule matched \{/);
    },
  );
});

describe("the inputs the gem refuses", () => {
  it.each(raised.map((entry) => [entry.input, entry] as const))(
    "%j: is refused here too",
    (_input, entry) => {
      // Every row here raised `Plurimath::Math::ParseError` inside `parse`
      // (`raisedIn`), which for UnicodeMath means the grammar itself refused —
      // there is no `rescue` under `lib/plurimath/unicode_math/`. The port's
      // grammar throws `ParseFailed`; this suite stands below the public
      // boundary that would turn it into a `ParseError`, so it asserts only
      // that the pipeline fails.
      expect(entry.raisedIn).toBe("parse");
      expect(() => parseFixture(entry)).toThrow();
    },
  );
});
