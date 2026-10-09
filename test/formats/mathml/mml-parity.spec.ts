/**
 * Parity for `src/formats/mathml/mml.ts` against the gem's `Mml.parse`.
 *
 * Every row of `./model-fixtures.json` records the tree `Mml.parse` built for
 * its input (`mml`), in the shape the generator's `view` gives it, or that it
 * refused (`raisedIn: "mml"`). `parseMml` must build the same tree, or refuse.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MML_READ_ATTRIBUTES } from "../../../src/formats/mathml/generated/mml-schema";
import { type MmlChild, MmlParseError, parseMml } from "../../../src/formats/mathml/mml";

interface Row {
  readonly id: string;
  readonly group: string;
  readonly input: string;
  readonly mml?: unknown;
  readonly raisedIn?: string;
}

const FIXTURE = JSON.parse(
  readFileSync(new URL("./model-fixtures.json", import.meta.url), "utf8"),
) as { readonly readAttributes: readonly string[]; readonly cases: readonly Row[] };

/** The generator's `view`, over the port's tree. */
function view(node: MmlChild): unknown {
  if (typeof node === "string") return { text: node };
  const attributes = Object.fromEntries([...node.attributes].sort(([a], [b]) => (a < b ? -1 : 1)));
  return {
    class: node.kind,
    attributes,
    ...(node.value === undefined ? {} : { value: node.value }),
    children: node.children.map(view),
  };
}

function outcome(input: string): unknown {
  try {
    return { mml: view(parseMml(input)) };
  } catch (error) {
    if (error instanceof MmlParseError) return { refused: true };
    throw error;
  }
}

describe("the fixture and the schema read the same attributes", () => {
  it("records exactly MML_READ_ATTRIBUTES", () => {
    expect([...FIXTURE.readAttributes]).toStrictEqual([...MML_READ_ATTRIBUTES]);
  });
});

describe("parseMml builds the tree Mml.parse builds", () => {
  const groups = [...new Set(FIXTURE.cases.map((row) => row.group))];
  it.each(groups)("%s", (group) => {
    const mismatches: string[] = [];
    for (const row of FIXTURE.cases) {
      if (row.group !== group) continue;
      const expected = row.raisedIn === "mml" ? { refused: true } : { mml: row.mml };
      const actual = outcome(row.input);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        mismatches.push(
          `${row.id} ${JSON.stringify(row.input).slice(0, 100)}\n  expected ${JSON.stringify(expected).slice(0, 400)}\n  actual   ${JSON.stringify(actual).slice(0, 400)}`,
        );
      }
    }
    expect(mismatches, mismatches.join("\n")).toStrictEqual([]);
  });
});
