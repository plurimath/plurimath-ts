/**
 * AsciiMath render parity against the pinned corpus, in two layers:
 *
 *  1. **Corpus layer** — rebuild each case's recorded `model:` into nodes
 *     (`model-builder`, the same rebuild the normalize round-trip uses) and
 *     require `toAsciimath` to reproduce `expected.asciimath` byte for byte.
 *     This isolates the renderer: a parser bug cannot hide or cause a
 *     failure here.
 *  2. **Round-trip layer** — `parseAsciimath(input)` → `toAsciimath` →
 *     `expected.asciimath`, the composition a caller actually runs.
 *
 * `expected.asciimath` is the gem's own render, recorded by the corpus
 * generator from the same parse that produced the model — so both layers
 * compare against `Plurimath::Math.parse(input, :asciimath).to_asciimath`.
 *
 * The case count is pinned (76 = the corpus's 77 cases minus the one
 * withheld UnitsML case that the pin actually contains — the exclusion
 * manifest names two, but the gem raises on the invalid one, so no case
 * for it was ever generated):
 * a suite that quietly loads zero cases has happened to this repository once
 * before, and `readCorpusCases` throwing on emptiness is belt to this brace.
 */

import { describe, expect, it } from "vitest";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { toAsciimath } from "../../../src/formats/asciimath/renderer";
import { aliasIndex, buildNode, readCensus, readCorpusCases } from "../../core/model-builder";

const cases = readCorpusCases();
const aliases = aliasIndex(readCensus());

function expectedAsciimath(entry: (typeof cases)[number]): string {
  const expected = entry.expected.get("asciimath");
  if (expected === undefined) throw new Error(`case ${entry.id}: no expected.asciimath recorded`);
  return expected;
}

describe("asciimath render parity, corpus layer (recorded model -> text)", () => {
  it("has the 76 reachable cases (77 pinned, 1 withheld as UnitsML)", () => {
    expect(cases.length).toBe(76);
  });

  it("every case carries an asciimath expectation", () => {
    for (const entry of cases) expect(entry.expected.has("asciimath"), entry.id).toBe(true);
  });

  it.each(cases.map((entry) => [entry.id, entry] as const))(
    "%s: rendering the gem's model reproduces the gem's bytes",
    (_id, entry) => {
      const node = buildNode(entry.model, aliases);
      expect(toAsciimath(node)).toBe(expectedAsciimath(entry));
    },
  );
});

describe("asciimath render parity, round-trip layer (input -> parse -> render)", () => {
  it.each(cases.map((entry) => [entry.id, entry] as const))(
    "%s: parse + render reproduces the gem's bytes",
    (_id, entry) => {
      expect(toAsciimath(parseAsciimath(entry.input))).toBe(expectedAsciimath(entry));
    },
  );
});
