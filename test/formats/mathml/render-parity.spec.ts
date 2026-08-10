/**
 * MathML render parity against the pinned corpus, in two layers — the
 * asciimath render-parity suite's structure, verbatim:
 *
 *  1. **Corpus layer** — rebuild each case's recorded `model:` into nodes
 *     (`model-builder`) and require `toMathml` to reproduce
 *     `expected.mathml` byte for byte. This isolates the renderer: a parser
 *     bug cannot hide or cause a failure here.
 *  2. **Round-trip layer** — `parseAsciimath(input)` → `toMathml` →
 *     `expected.mathml`, the composition a caller actually runs.
 *
 * `expected.mathml` is the gem's own `to_mathml` (default options: intent
 * false, displaystyle from the formula, unary spacing on), recorded by the
 * corpus generator from the same parse that produced the model.
 *
 * The case count is pinned (69 = 71 pinned minus the 2 UnitsML exclusions):
 * a suite that quietly loads zero cases has happened to this repository
 * once before.
 */

import { describe, expect, it } from "vitest";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { toMathml } from "../../../src/formats/mathml/renderer";
import { aliasIndex, buildNode, readCensus, readCorpusCases } from "../../core/model-builder";

const cases = readCorpusCases();
const aliases = aliasIndex(readCensus());

function expectedMathml(entry: (typeof cases)[number]): string {
  const expected = entry.expected.get("mathml");
  if (expected === undefined) throw new Error(`case ${entry.id}: no expected.mathml recorded`);
  return expected;
}

describe("mathml render parity, corpus layer (recorded model -> bytes)", () => {
  it("has the 69 reachable cases (71 pinned, 2 excluded as UnitsML)", () => {
    expect(cases.length).toBe(69);
  });

  it("every case carries a mathml expectation", () => {
    for (const entry of cases) expect(entry.expected.has("mathml"), entry.id).toBe(true);
  });

  it.each(cases.map((entry) => [entry.id, entry] as const))(
    "%s: rendering the gem's model reproduces the gem's bytes",
    (_id, entry) => {
      const node = buildNode(entry.model, aliases);
      expect(toMathml(node)).toBe(expectedMathml(entry));
    },
  );
});

describe("mathml render parity, round-trip layer (input -> parse -> render)", () => {
  it.each(cases.map((entry) => [entry.id, entry] as const))(
    "%s: parse + render reproduces the gem's bytes",
    (_id, entry) => {
      expect(toMathml(parseAsciimath(entry.input))).toBe(expectedMathml(entry));
    },
  );
});
