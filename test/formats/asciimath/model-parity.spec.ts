/**
 * End-to-end corpus model parity (TODO.plan p1/05): for every reachable
 * pinned case, preprocess → grammar → transform → `normalize` must deep-equal
 * the model the gem recorded for the same input.
 *
 * The pipeline runs from the raw INPUT, never from the recorded `parse_tree`:
 * corpus serialization flattens `Parslet::Slice` into plain strings, and the
 * transform branches on `text.is_a?(Slice)` (`transform.rb:74`), so a
 * recorded tree fed to the transform produces a bare string where the gem
 * produced `Math::Function::Text`. Measured, not theoretical — which is why
 * this suite is end-to-end or nothing.
 *
 * The recorded `model` came from `Plurimath::Math.parse(input, :asciimath)`,
 * so it carries `input_string`; `parseAsciimath` mirrors that boundary.
 */

import { describe, expect, it } from "vitest";
import { normalize } from "../../../src/core/index";
import { parseAsciimath } from "../../../src/formats/asciimath/parser";
import { readCorpusCases } from "../../core/model-builder";

const cases = readCorpusCases();

describe("the pinned corpus, end to end", () => {
  it("has the 75 reachable cases (76 pinned, 1 withheld as UnitsML)", () => {
    // A suite that quietly ran zero cases has already happened to this
    // repository once (the depcruise gate); the count is pinned so it cannot.
    expect(cases.length).toBe(75);
  });

  it.each(cases.map((entry) => [entry.id, entry] as const))(
    "%s: the parsed model deep-equals the gem's",
    (_id, entry) => {
      const formula = parseAsciimath(entry.input);
      expect(normalize(formula)).toStrictEqual(entry.model);
    },
  );
});
