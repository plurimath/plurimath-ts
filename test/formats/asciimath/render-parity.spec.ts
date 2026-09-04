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
 * Both counts are pinned (91 = the corpus's 92 cases minus the one
 * withheld UnitsML case that the pin actually contains — the exclusion
 * manifest names two, but the gem raises on the invalid one, so no case
 * for it was ever generated; all 91 render to this target):
 * a suite that quietly loads zero cases has happened to this repository once
 * before, and `readCorpusCases` throwing on emptiness is belt to this brace.
 */

import { describe, expect, it } from "vitest";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { toAsciimath } from "../../../src/formats/asciimath/renderer";
import { aliasIndex, buildNode, readCensus, readCorpusCases } from "../../core/model-builder";

const cases = readCorpusCases();
const aliases = aliasIndex(readCensus());

/**
 * The cases with bytes to compare. A `cases/2` case may record that the gem
 * REFUSED a target rather than rendered it (`corpus-pin.ts`, `refusals`), and
 * a refusal has no bytes — so it is not a parity case for this format. What
 * this port does at that boundary is asserted separately, not here.
 */
const rendered = cases.filter((entry) => entry.expected.has("asciimath"));

function expectedAsciimath(entry: (typeof cases)[number]): string {
  const expected = entry.expected.get("asciimath");
  if (expected === undefined) throw new Error(`case ${entry.id}: no expected.asciimath recorded`);
  return expected;
}

describe("asciimath render parity, corpus layer (recorded model -> text)", () => {
  it("has the 91 reachable cases (92 pinned, 1 withheld as UnitsML)", () => {
    // A suite that quietly loaded zero cases has happened to this repository
    // once before; both counts are pinned so it cannot happen silently.
    expect(cases.length).toBe(91);
    expect(rendered.length).toBe(91);
  });

  it("accounts for every case, as a rendering or as a refusal", () => {
    // Neither would mean the corpus reader handed over a case this format
    // never looks at, which is the failure `refusals` exists to make visible.
    for (const entry of cases) {
      expect(entry.expected.has("asciimath") || entry.refusals.has("asciimath"), entry.id).toBe(
        true,
      );
    }
  });

  it.each(rendered.map((entry) => [entry.id, entry] as const))(
    "%s: rendering the gem's model reproduces the gem's bytes",
    (_id, entry) => {
      const node = buildNode(entry.model, aliases);
      expect(toAsciimath(node)).toBe(expectedAsciimath(entry));
    },
  );
});

describe("asciimath render parity, round-trip layer (input -> parse -> render)", () => {
  it.each(rendered.map((entry) => [entry.id, entry] as const))(
    "%s: parse + render reproduces the gem's bytes",
    (_id, entry) => {
      expect(toAsciimath(parseAsciimath(entry.input))).toBe(expectedAsciimath(entry));
    },
  );
});
