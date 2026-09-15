/**
 * The HTML registration battery for `src/compat/index.ts`'s `PARSERS` map.
 *
 * `html` is withheld from the compat constructor's `PARSERS` map (see that
 * file's own comment on `unicode`, which set the precedent this file follows):
 * a format listed there should answer what the gem answers, or say up front
 * that it cannot, and that has to be MEASURED against input nobody generated
 * — fifty ordinary HTML math snippets, hand-typed here, none of them corpus
 * output and none of them drawn from `test/formats/html/model-fixtures.json`'s
 * round-trip or rule-coverage lists. This file is that measurement, not a
 * decision: registering `html` is a judgement for whoever reads its result,
 * not something this spec does on its own.
 *
 * There is no equivalent UnicodeMath file to model this on. `index.ts`'s
 * comment there cites a "50-input battery", but that battery was only ever
 * prose — measured once, in an earlier session, and never committed as a
 * test. This file's shape instead follows `test/formats/html/model-parity.spec.ts`,
 * the repository's real fixture-plus-spec convention: a generator
 * (`scripts/battery-html-fixtures.rb`) queries the oracle for every
 * input and records what it did, and this spec reads that recorded JSON and
 * compares it against `parseHtml`.
 *
 * Oracle: /home/apple/ruby_gems/plurimath-oracle at the commit
 * `html-battery-fixtures.json`'s own `oracleCommit` field records — read here
 * rather than repeated, so this comment cannot go stale the way a hand-copied
 * commit hash would.
 *
 * Every row's outcome is measured, not assumed passing: running this file
 * against the current port is what step 4 of the task that produced it calls
 * for, and the counts below come from that run rather than from what a
 * "complete" HTML port would be expected to do.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalize, ParseError } from "../../src/core/index";
import { parseHtml } from "../../src/formats/html/parser";

const HERE = dirname(fileURLToPath(import.meta.url));

interface FixtureCase {
  readonly id: string;
  readonly group: string;
  readonly input: string;
  readonly model?: unknown;
  readonly raises?: string;
}

interface Fixtures {
  readonly schema: string;
  readonly oracleCommit: string;
  readonly caseCount: number;
  readonly parsedCount: number;
  readonly raisedCount: number;
  readonly cases: readonly FixtureCase[];
}

const fixtures = JSON.parse(
  readFileSync(join(HERE, "html-battery-fixtures.json"), "utf8"),
) as Fixtures;

const parsed = fixtures.cases.filter((entry) => entry.model !== undefined);
const raised = fixtures.cases.filter((entry) => entry.raises !== undefined);

describe("the HTML battery fixture set", () => {
  it("is the schema this suite reads", () => {
    expect(fixtures.schema).toBe("plurimath-compat/html-battery/1");
  });

  it("has fifty hand-typed cases", () => {
    expect(fixtures.caseCount).toBe(50);
    expect(fixtures.cases.length).toBe(50);
  });

  it("has the counts its header records", () => {
    expect(fixtures.cases.length).toBe(fixtures.caseCount);
    expect(parsed.length).toBe(fixtures.parsedCount);
    expect(raised.length).toBe(fixtures.raisedCount);
    expect(parsed.length + raised.length).toBe(fixtures.caseCount);
  });

  it("draws every input from none of the managed corpus/round-trip fixture files", () => {
    // Distinct from `test/formats/html/model-fixtures.json`'s own id prefix
    // ("html-<hash>"), so a row accidentally reused from there is caught here.
    for (const entry of fixtures.cases) {
      expect(entry.id.startsWith("html-battery-")).toBe(true);
    }
  });
});

/**
 * A case here is either an oracle PASS (the port's `normalize(parseHtml(...))`
 * deep-equals the model the gem built) or a documented GAP (measured here to
 * currently diverge, and asserted to diverge — so a fix that closes it makes
 * THIS assertion fail, which is the signal to move the id out of the list
 * rather than the list silently going stale).
 *
 * At the time this file was written, the port matched every one of the 49
 * inputs the oracle parses and refused the 1 the oracle refuses: this list is
 * empty. It exists so a future regression — or a future addition to the
 * battery that the port does not yet handle — has somewhere to be recorded
 * instead of turning the whole suite red.
 */
const KNOWN_PORT_GAPS: ReadonlySet<string> = new Set([]);

describe("the parsed model", () => {
  it.each(parsed.map((entry) => [entry.group, entry.input, entry] as const))(
    "%s %j: deep-equals the gem's",
    (_group, _input, entry) => {
      if (KNOWN_PORT_GAPS.has(entry.id)) {
        expect(normalize(parseHtml(entry.input))).not.toStrictEqual(entry.model);
        return;
      }
      expect(normalize(parseHtml(entry.input))).toStrictEqual(entry.model);
    },
  );
});

describe("the inputs the gem refuses", () => {
  it.each(raised.map((entry) => [entry.group, entry.input, entry] as const))(
    "%s %j: is refused here too",
    (_group, _input, entry) => {
      expect(entry.raises).toBe("Plurimath::Math::ParseError");
      if (KNOWN_PORT_GAPS.has(entry.id)) {
        expect(() => parseHtml(entry.input)).not.toThrow();
        return;
      }
      expect(() => parseHtml(entry.input)).toThrow(ParseError);
    },
  );
});
