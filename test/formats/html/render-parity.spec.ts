/**
 * Oracle-backed parity for a format the shared corpus carries no target for.
 *
 * The four P1 formats get this from `corpus-conformance`. OMML and HTML did
 * not, which is how six parity defects reached review with 2,900 tests green.
 *
 * Fixtures are generated, never hand-typed:
 *   ruby scripts/generate-parity-fixtures.rb --oracle <clean pinned checkout>
 *
 * Three things are asserted, and the third is the one that matters:
 *   1. every case the port renders is byte-identical to the gem;
 *   2. the suite fails on emptiness -- zero cases loaded is a FAILURE;
 *   3. the RENDER COUNT is pinned. A renderer that starts refusing a case it
 *      used to render fails here, and so does one that starts rendering a case
 *      it used to refuse -- the second is progress, and the number is bumped
 *      in the same commit that earns it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAsciimath } from "../../../src/formats/asciimath/index";
import { loadPinnedCorpus } from "../../core/corpus-pin";
import { FORMAT, KNOWN_DIVERGENCES, RENDER, RENDERED_BASELINE } from "./parity-target";

interface Fixture {
  readonly oracle: { readonly commit: string; readonly version: string };
  readonly format: string;
  readonly caseCount: number;
  readonly renderedCount: number;
  readonly cases: ReadonlyArray<{
    readonly group: string;
    readonly id: string;
    readonly input: string;
    readonly expected?: string;
    readonly raises?: string;
  }>;
}

const fixture = JSON.parse(
  readFileSync(join(__dirname, "parity-fixtures.json"), "utf8"),
) as Fixture;

describe(`${FORMAT} parity against the pinned oracle`, () => {
  it("loaded a non-empty fixture generated from the pinned oracle", () => {
    expect(fixture.format).toBe(FORMAT);
    expect(fixture.cases.length).toBeGreaterThan(0);
    expect(fixture.renderedCount).toBeGreaterThan(0);
    expect(fixture.oracle.commit).toBe(loadPinnedCorpus().provenance.oracleCommit);
  });

  const renderable = fixture.cases.filter((c) => typeof c.expected === "string");

  it("the gem renders a non-empty subset", () => {
    expect(renderable.length).toBeGreaterThan(0);
  });

  const outcomes: Array<{ id: string; rendered: boolean }> = [];

  it.each(renderable.map((c) => [c.id, c] as const))(
    "%s matches the gem byte-for-byte, or refuses",
    (_id, c) => {
      let actual: string | null = null;
      try {
        actual = RENDER(parseAsciimath(c.input) as never);
      } catch {
        actual = null;
      }
      outcomes.push({ id: c.id, rendered: actual !== null });
      if (actual === null) return;

      const reason = KNOWN_DIVERGENCES[c.id];
      if (reason !== undefined) {
        // A divergence recorded in TODO.plan/deferred.md. Pinned as UNEQUAL on
        // purpose: if it ever starts matching, this fails and the entry goes.
        expect(
          actual,
          `${c.id} now matches the gem -- drop it from KNOWN_DIVERGENCES (${reason})`,
        ).not.toBe(c.expected);
        return;
      }
      expect(actual).toBe(c.expected);
    },
  );

  it(`renders exactly ${RENDERED_BASELINE} of the gem-renderable cases`, () => {
    const rendered = outcomes.filter((o) => o.rendered).length;
    expect(
      rendered,
      rendered > RENDERED_BASELINE
        ? `Coverage IMPROVED to ${rendered}. Raise RENDERED_BASELINE in parity-target.ts.`
        : `Coverage REGRESSED to ${rendered}. A case that used to render now refuses.`,
    ).toBe(RENDERED_BASELINE);
  });
});
