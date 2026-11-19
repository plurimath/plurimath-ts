/**
 * Root-level failure positions: the port's AsciiMath root rule, `expression`,
 * compared with the oracle's public root parse over a shared list of short,
 * already-preprocessed inputs.
 *
 * Since plurimath 0.11.13 the oracle parses AsciiMath with the amath gem, whose
 * rules are not public, so only the root has an oracle answer. Every expected
 * value is read from `failure-position-fixtures.json`, which
 * `scripts/generate-asciimath-failure-positions.rb` writes from the pinned gem
 * (sidecar: `failure-position-fixtures.manifest.yaml`). amath's messages are
 * recorded in the fixture but are not compared: message text is not API
 * (ARCHITECTURE.md §5).
 *
 * The port parses through amath-ts, the TypeScript build of the same amath
 * grammar, and both count the refusal in characters. Each disagreement would be
 * listed in `KNOWN_PARITY_GAPS` with its kind, and the list is asserted
 * exactly: a gap that closes, or a new one, fails here.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { asciimathStage } from "../../../src/formats/asciimath/stage";

interface FixtureCase {
  readonly id: string;
  readonly rule: string;
  readonly input: string;
  readonly accepts: boolean;
  readonly index?: number;
  readonly message?: string;
}

interface Fixture {
  readonly rule: string;
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

/**
 * Root-level disagreements between the port and the oracle, by input.
 * `verdict`: one side accepts what the other refuses. `offset`: both refuse,
 * at different offsets.
 */
const KNOWN_PARITY_GAPS: Readonly<Record<string, "verdict" | "offset">> = {};

/** The gap count, pinned so a change to the list is a visible decision. */
const KNOWN_PARITY_GAP_COUNT = 0;

/** The port's verdict, in characters: `null` when the stage accepted the whole input. */
function portFailure(input: string): number | null {
  try {
    asciimathStage().parseTree(input);
    return null;
  } catch (error) {
    const at = (error as { charOffset?: unknown }).charOffset;
    if (typeof at === "number") return at;
    throw error;
  }
}

function gap(c: FixtureCase): "verdict" | "offset" | null {
  const index = portFailure(c.input);
  if ((index === null) !== c.accepts) return "verdict";
  if (index === null || c.index === undefined) return null;
  return index === c.index ? null : "offset";
}

describe("the root failure-position fixture", () => {
  it("is the root rule over every input, with both verdicts present", () => {
    expect(fixture.rule).toBe("expression");
    expect(fixture.cases.length).toBe(fixture.caseCount);
    expect(fixture.cases.length).toBe(fixture.inputCount);
    expect(fixture.cases.every((c) => c.rule === fixture.rule)).toBe(true);
    expect(fixture.cases.filter((c) => !c.accepts).length).toBe(fixture.rejectedCount);
    expect(fixture.rejectedCount).toBeGreaterThan(0);
    expect(fixture.cases.some((c) => !c.accepts && (c.index ?? 0) > 0)).toBe(true);
  });
});

describe("the port's root parse against the oracle", () => {
  it("disagrees exactly where KNOWN_PARITY_GAPS says, and nowhere else", () => {
    const observed: Record<string, "verdict" | "offset"> = {};
    for (const c of fixture.cases) {
      const kind = gap(c);
      if (kind !== null) observed[c.input] = kind;
    }
    expect(observed).toStrictEqual(KNOWN_PARITY_GAPS);
    expect(Object.keys(observed).length).toBe(KNOWN_PARITY_GAP_COUNT);
  });
});
