/**
 * Degenerate-slot sweep against the pinned oracle.
 *
 * Every parity defect found in the OMML review lived in a slot the conformance
 * corpus never constructs -- nil, false, an empty array -- and ARCHITECTURE.md
 * section 5 states hand-built trees are a SUPPORTED use. Five of eight shared one
 * root cause: Ruby-falsy is {nil, false}; JavaScript-falsy also swallows 0 and "".
 *
 * Fixtures are generated, never hand-typed:
 *   ruby scripts/probe-degenerate-slots.rb --oracle <clean checkout> \
 *        --format <fmt> --out test/formats/<fmt>/degenerate-fixtures.json
 *
 * What is asserted:
 *   1. the fixture is non-empty and came from the pinned oracle;
 *   2. for every row, the port RENDERS exactly when the gem renders -- refusing
 *      where the gem renders is a capability gap, rendering where the gem raises
 *      is a divergence;
 *   3. the disagreement count is pinned, so the gap can only shrink silently
 *      and never grow.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPinnedCorpus } from "../../core/corpus-pin";
import { DEGENERATE_BASELINE, FORMAT, NODE_FOR, RENDER } from "./parity-target";

interface Row {
  readonly kind: string;
  readonly slot: number;
  readonly value: string;
  readonly renders: boolean;
  readonly error?: string;
}
interface Fixture {
  readonly oracle: { readonly commit: string };
  readonly format: string;
  readonly rowCount: number;
  readonly rows: readonly Row[];
}

const fixture = JSON.parse(
  readFileSync(join(__dirname, "degenerate-fixtures.json"), "utf8"),
) as Fixture;

const DEGENERATE: Readonly<Record<string, unknown>> = {
  nil: null,
  false: false,
  true: true,
  zero: 0,
  "empty-string": "",
  "empty-array": [],
  node: undefined, // replaced by NODE_FOR's own symbol
};

describe(`${FORMAT} degenerate-slot parity`, () => {
  it("loaded a non-empty fixture from the pinned oracle", () => {
    expect(fixture.format).toBe(FORMAT);
    expect(fixture.rows.length).toBeGreaterThan(0);
    expect(fixture.oracle.commit).toBe(loadPinnedCorpus().provenance.oracleCommit);
  });

  const disagreements: string[] = [];

  it.each(fixture.rows.map((r) => [`${r.kind}[${r.slot}]=${r.value}`, r] as const))(
    "%s agrees with the gem on render-vs-refuse",
    (label, row) => {
      const build = NODE_FOR[row.kind];
      if (build === undefined) return; // kind not in this format's slice yet

      let portRenders: boolean;
      try {
        RENDER(build(row.slot, DEGENERATE[row.value]) as never);
        portRenders = true;
      } catch {
        portRenders = false;
      }
      if (portRenders !== row.renders) {
        disagreements.push(
          `${label}: gem ${row.renders ? "renders" : "raises"}, port ${portRenders ? "renders" : "refuses"}`,
        );
      }
    },
  );

  it(`disagrees with the gem on exactly ${DEGENERATE_BASELINE} rows`, () => {
    expect(
      disagreements.length,
      disagreements.length > DEGENERATE_BASELINE
        ? `NEW disagreements:\n  ${disagreements.join("\n  ")}`
        : `Gap SHRANK to ${disagreements.length}. Lower DEGENERATE_BASELINE in parity-target.ts.`,
    ).toBe(DEGENERATE_BASELINE);
  });
});
