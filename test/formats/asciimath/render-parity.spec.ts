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
 * generator from the same parse that produced the model —
 * `Plurimath::Math.parse(input, format).to_asciimath`, where `format` is the
 * case's own `input_format`. Both layers compare against that; the round-trip
 * layer is the subset where `format` is `:asciimath`.
 *
 * Every count is pinned, because a suite that quietly loads zero cases has
 * happened to this repository once before and `readCorpusCases` throwing on
 * emptiness is only belt to that brace:
 *
 *   - 216 reachable cases: the pin holds 217 and the one withheld UnitsML case
 *     it actually contains is dropped. The exclusion manifest names two, but
 *     the gem raises on the invalid one, so no case for it was ever generated;
 *   - 216 of those carry `expected.asciimath` bytes to compare;
 *   - 91 go through the round-trip layer, which is the AsciiMath-written
 *     subset. That says which parser the layer calls, not what this port can
 *     parse: `parseLatex` landed in #76 and drives
 *     `../latex/rejection-parity.spec.ts`. Widening this layer to the other
 *     125 is a separate change with its own measurement to do.
 */

import { describe, expect, it } from "vitest";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { toAsciimath } from "../../../src/formats/asciimath/renderer";
import {
  aliasIndex,
  buildNode,
  parseableCases,
  readCensus,
  readCorpusCases,
} from "../../core/model-builder";

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
  it("has the 216 reachable cases (217 pinned, 1 withheld as UnitsML)", () => {
    // A suite that quietly loaded zero cases has happened to this repository
    // once before; both counts are pinned so it cannot happen silently.
    expect(cases.length).toBe(216);
    expect(rendered.length).toBe(216);
    // The round-trip layer's scoped list is pinned too, and it is far smaller
    // than the corpus layer: 91 of the 216 reachable cases are written in
    // AsciiMath and 125 in LaTeX. This layer calls `parseAsciimath`, so it
    // takes the 91. The gap between the two numbers IS the second input
    // corpus, so a suite that stopped scoping would show up here as the two
    // converging.
    expect(roundTrip.length).toBe(91);
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

// The model layer above rebuilds from `model` and is parser-independent, so it
// takes every pinned case whatever notation the input is written in. This layer
// calls `parseAsciimath`, so it takes only the AsciiMath ones.
const roundTrip = parseableCases(rendered);

describe("asciimath render parity, round-trip layer (input -> parse -> render)", () => {
  it.each(roundTrip.map((entry) => [entry.id, entry] as const))(
    "%s: parse + render reproduces the gem's bytes",
    (_id, entry) => {
      expect(toAsciimath(parseAsciimath(entry.input))).toBe(expectedAsciimath(entry));
    },
  );
});
