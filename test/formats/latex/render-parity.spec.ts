/**
 * LaTeX render parity against the pinned corpus, in two layers — the same
 * proof structure as `../asciimath/render-parity.spec.ts`:
 *
 *  1. **Corpus layer** — rebuild each case's recorded `model:` into nodes
 *     (`model-builder`, the same rebuild the normalize round-trip uses) and
 *     require `toLatex` to reproduce `expected.latex` byte for byte. This
 *     isolates the renderer: a parser bug cannot hide or cause a failure
 *     here.
 *  2. **Round-trip layer** — `parseAsciimath(input)` → `toLatex` →
 *     `expected.latex`, the composition a caller actually runs.
 *
 * `expected.latex` is the gem's own render, recorded by the corpus generator
 * from the same parse that produced the model — so both layers compare
 * against `Plurimath::Math.parse(input, :asciimath).to_latex`.
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
import { toLatex } from "../../../src/formats/latex/renderer";
import { aliasIndex, buildNode, readCensus, readCorpusCases } from "../../core/model-builder";

const cases = readCorpusCases();
const aliases = aliasIndex(readCensus());

function expectedLatex(entry: (typeof cases)[number]): string {
  const expected = entry.expected.get("latex");
  if (expected === undefined) throw new Error(`case ${entry.id}: no expected.latex recorded`);
  return expected;
}

describe("latex render parity, corpus layer (recorded model -> text)", () => {
  it("has the 76 reachable cases (77 pinned, 1 withheld as UnitsML)", () => {
    expect(cases.length).toBe(76);
  });

  it("every case carries a latex expectation", () => {
    for (const entry of cases) expect(entry.expected.has("latex"), entry.id).toBe(true);
  });

  it.each(cases.map((entry) => [entry.id, entry] as const))(
    "%s: rendering the gem's model reproduces the gem's bytes",
    (_id, entry) => {
      const node = buildNode(entry.model, aliases);
      expect(toLatex(node)).toBe(expectedLatex(entry));
    },
  );
});

describe("latex render parity, round-trip layer (input -> parse -> render)", () => {
  it.each(cases.map((entry) => [entry.id, entry] as const))(
    "%s: parse + render reproduces the gem's bytes",
    (_id, entry) => {
      expect(toLatex(parseAsciimath(entry.input))).toBe(expectedLatex(entry));
    },
  );
});
