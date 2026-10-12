/**
 * Per-rule failure positions (TODO.plan/p1-asciimath/04-asciimath-grammar.md):
 * every AsciiMath grammar rule that can fail has a test pinning WHERE it
 * fails, not only a success tree.
 *
 * `failure-parity.spec.ts` and the corpus rejections reach failure positions
 * only through the root rule, `expression`, whose empty alternative always
 * succeeds; a rule whose failure offset drifted underneath it could pass both.
 * Here each of the grammar's rules is the parse root in turn, over the same
 * list of short inputs, and the port's `ParseFailed.index` is compared with
 * the oracle's.
 *
 * Every expected value is read from `failure-position-fixtures.json`, which
 * `scripts/generate-asciimath-failure-positions.rb` writes from the pinned gem
 * (sidecar: `failure-position-fixtures.manifest.yaml`; regenerated and diffed
 * by `scripts/gate-oracle.rb repo --check`). The gem's `index` is the deepest
 * offset in Parslet's cause tree, the walk the corpus generator uses for
 * `rejections`. Parslet's messages are recorded in the fixture but are not
 * compared: message text is not API (ARCHITECTURE.md §5).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createAsciimathGrammar } from "../../../src/formats/asciimath/grammar";
import { ParseFailed } from "../../../src/pegkit/index";

interface FixtureCase {
  readonly rule: string;
  readonly gemRule: string;
  readonly input: string;
  readonly accepts: boolean;
  readonly index?: number;
  readonly rootIndex?: number;
  readonly message?: string;
}

interface Fixture {
  readonly ruleCount: number;
  readonly inputCount: number;
  readonly caseCount: number;
  readonly rejectedCount: number;
  readonly cases: readonly FixtureCase[];
}

const fixture = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "failure-position-fixtures.json"),
    "utf8",
  ),
) as Fixture;

const grammar = createAsciimathGrammar();
const rules = grammar.rules as unknown as Record<
  string,
  { parse(input: string): unknown } | undefined
>;

/**
 * The cases, by `rule|input`, where the port's offset differs from the gem's.
 *
 * They are one difference of DEFINITION, not of behaviour: both sides agree
 * on every verdict. The gem's number is the deepest leaf in Parslet's cause
 * tree, which is Parslet's internal bookkeeping (it points past the end of
 * `left(a right`, and before the failing digit of `0x`, because Parslet prunes
 * the tree it keeps). The port's `ParseFailed.index` is the offset of the
 * first code unit the rule could not consume, the definition
 * `failure-parity.spec.ts` fixes for `ParseError.index`; the same root-level
 * difference is the "disagrees with this port on 3 of the 26" recorded there.
 *
 * Each is asserted to STILL differ, so a change to either side that closes
 * one shows up here instead of passing quietly.
 */
const KNOWN_DIVERGENCES: ReadonlySet<string> = new Set([
  "td|left(a right",
  "controversialSymbols|left(a right",
  "powerBaseRules|0x",
  "powerBaseRules|1.",
  "colorValue|a b",
  "colorValue|^a",
  "colorValue|_a",
  "colorValue|a/b c",
  "colorValue|a/",
  "colorValue|color",
  "colorValue|color(red)",
  "colorValue|a mod",
  "colorValue|left(a right)",
  "colorValue|left(a right)x",
  "colorValue|left(a right",
  "colorValue|x^2 y",
  "frac|a/b c",
  "frac|0x",
  "frac|1.",
  "mod|0x",
  "mod|1.",
  "iteration|a b",
  "iteration|^a",
  "iteration|_a",
  "iteration|a/b c",
  "iteration|a/",
  "iteration|color",
  "iteration|color(red)",
  "iteration|a mod",
  "iteration|left(a right)",
  "iteration|left(a right)x",
  "iteration|left(a right",
  "iteration|x^2 y",
  "expression|left(a right",
]);

const keyOf = (c: FixtureCase) => `${c.rule}|${c.input}`;

/** The port's verdict: `null` when the rule consumed the whole input. */
function portFailure(c: FixtureCase): number | null {
  const atom = rules[c.rule];
  if (atom === undefined) throw new Error(`the port has no rule ${c.rule}`);
  try {
    atom.parse(c.input);
    return null;
  } catch (error) {
    if (error instanceof ParseFailed) return error.index;
    throw error;
  }
}

describe("the failure-position fixture", () => {
  it("covers every rule the port's grammar exposes, and nothing else", () => {
    const fixtureRules = [...new Set(fixture.cases.map((c) => c.rule))].sort();
    expect(fixtureRules).toStrictEqual(Object.keys(rules).sort());
    expect(fixtureRules.length).toBe(fixture.ruleCount);
    expect(fixture.cases.length).toBe(fixture.caseCount);
    expect(fixture.cases.length).toBe(fixture.ruleCount * fixture.inputCount);
  });

  it("makes every rule fail at least once, so each rule's position is checked", () => {
    for (const rule of Object.keys(rules)) {
      expect(
        fixture.cases.some((c) => c.rule === rule && !c.accepts),
        `${rule} never fails`,
      ).toBe(true);
    }
    expect(fixture.cases.filter((c) => !c.accepts).length).toBe(fixture.rejectedCount);
  });

  it("names only divergences that exist in the fixture", () => {
    const keys = new Set(fixture.cases.map(keyOf));
    for (const key of KNOWN_DIVERGENCES) expect(keys.has(key), key).toBe(true);
  });
});

describe.each(Object.keys(rules).sort())("rule %s", (rule) => {
  const cases = fixture.cases.filter((c) => c.rule === rule);

  it("accepts and rejects exactly what the gem does", () => {
    const mismatched = cases
      .filter((c) => (portFailure(c) === null) !== c.accepts)
      .map((c) => `${JSON.stringify(c.input)} gem ${c.accepts ? "accepts" : "rejects"}`);
    expect(mismatched).toStrictEqual([]);
  });

  it("fails at the offset the gem reports", () => {
    const wrong: string[] = [];
    for (const c of cases) {
      if (c.accepts) continue;
      const index = portFailure(c);
      const diverges = index !== c.index;
      if (diverges !== KNOWN_DIVERGENCES.has(keyOf(c))) {
        wrong.push(`${JSON.stringify(c.input)}: port ${index}, gem ${c.index}`);
      }
    }
    expect(wrong).toStrictEqual([]);
  });
});
