/**
 * UnicodeMath render parity against the pinned corpus, in two layers — the same
 * proof structure as `../asciimath/render-parity.spec.ts`:
 *
 *  1. **Corpus layer** — rebuild each case's recorded `model:` into nodes
 *     (`model-builder`, the same rebuild the normalize round-trip uses) and
 *     require `toUnicodemath` to reproduce `expected.unicodemath` byte for byte. This
 *     isolates the renderer: a parser bug cannot hide or cause a failure
 *     here.
 *  2. **Round-trip layer** — `parseAsciimath(input)` → `toUnicodemath` →
 *     `expected.unicodemath`, the composition a caller actually runs.
 *
 * `expected.unicodemath` is the gem's own render, recorded by the corpus generator
 * from the same parse that produced the model — so both layers compare
 * against `Plurimath::Math.parse(input, :asciimath).to_unicodemath`.
 *
 * The case count is pinned (69 = the corpus's 70 cases minus the one
 * withheld UnitsML case that the pin actually contains — the exclusion
 * manifest names two, but the gem raises on the invalid one, so no case
 * for it was ever generated):
 * a suite that quietly loads zero cases has happened to this repository once
 * before, and `readCorpusCases` throwing on emptiness is belt to this brace.
 */

import { describe, expect, it } from "vitest";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { toUnicodemath } from "../../../src/formats/unicodemath/renderer";
import { aliasIndex, buildNode, readCensus, readCorpusCases } from "../../core/model-builder";

const cases = readCorpusCases();
const aliases = aliasIndex(readCensus());

function expectedLatex(entry: (typeof cases)[number]): string {
  const expected = entry.expected.get("unicodemath");
  if (expected === undefined) throw new Error(`case ${entry.id}: no expected.unicodemath recorded`);
  return expected;
}

describe("unicodemath render parity, corpus layer (recorded model -> text)", () => {
  it("has the 69 reachable cases (70 pinned, 1 withheld as UnitsML)", () => {
    expect(cases.length).toBe(69);
  });

  it("every case carries a unicodemath expectation", () => {
    for (const entry of cases) expect(entry.expected.has("unicodemath"), entry.id).toBe(true);
  });

  it.each(cases.map((entry) => [entry.id, entry] as const))(
    "%s: rendering the gem's model reproduces the gem's bytes",
    (_id, entry) => {
      const node = buildNode(entry.model, aliases);
      expect(toUnicodemath(node)).toBe(expectedLatex(entry));
    },
  );
});

describe("unicodemath render parity, round-trip layer (input -> parse -> render)", () => {
  it.each(cases.map((entry) => [entry.id, entry] as const))(
    "%s: parse + render reproduces the gem's bytes",
    (_id, entry) => {
      expect(toUnicodemath(parseAsciimath(entry.input))).toBe(expectedLatex(entry));
    },
  );
});
