/**
 * Degenerate-slot sweep against the pinned oracle.
 *
 * Every parity defect found in the OMML review lived in a slot the conformance
 * corpus never constructs — nil, false, an empty array — and ARCHITECTURE.md
 * section 5 states hand-built trees are a SUPPORTED use. Five of eight shared one
 * root cause: Ruby-falsy is {nil, false}; JavaScript-falsy also swallows 0 and "".
 * This sweep is the executable form of that lesson, and it immediately found a
 * sixth instance of it (`DEGENERATE_DIVERGENCES` in `parity-target.ts`).
 *
 * Fixtures are generated, never hand-typed:
 *   ruby scripts/probe-degenerate-slots.rb --oracle <clean checkout> \
 *        --format omml --out test/formats/omml/degenerate-fixtures.json
 *
 * What is asserted:
 *
 *   1. **The fixture is the whole matrix.** `NODE_FOR` (in `parity-target.ts`)
 *      and `DEGENERATE` (below) are hand-maintained and no generator writes
 *      them, so the kind × slot × value grid they describe is an independent
 *      statement of what the sweep must contain. Every row is checked against
 *      it, and the fixture's own `rowCount`/`rendersCount` are checked against
 *      its own rows. In the HTML version a reviewer cut the fixture from 196
 *      rows to ONE, left `rowCount: 196`, and both specs still passed 94 tests.
 *      Nothing read that number.
 *   2. **A kind the generator sweeps and `NODE_FOR` cannot build FAILS.** It
 *      used to `return`, so `power`'s 14 rows reported green while asserting
 *      nothing at all, under a header claiming every kind × slot was covered.
 *   3. **Bytes, not booleans.** Where the gem renders, the port must reproduce
 *      its exact output. The first version compared render-versus-throw only:
 *      replacing every rendered result in the fixture with a placeholder string
 *      left the whole suite green.
 *   4. Where the gem renders and the port cannot, the row is named in
 *      `DEGENERATE_REFUSES` with a reason, and is pinned as refusing. Where the
 *      port renders the WRONG bytes, the row is named in
 *      `DEGENERATE_DIVERGENCES` and is pinned BOTH ways — the port's exact bytes
 *      and inequality with the gem's — so neither further corruption nor the fix
 *      passes unnoticed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RenderError } from "../../../src/core/index";
import { loadPinnedCorpus } from "../../core/corpus-pin";
import {
  DEGENERATE_DIVERGENCES,
  DEGENERATE_REFUSES,
  FORMAT,
  NODE_FOR,
  RENDER,
} from "./parity-target";

interface Row {
  readonly kind: string;
  readonly slot: number;
  readonly value: string;
  readonly renders: boolean;
  readonly output?: string;
  readonly error?: string;
}
interface Fixture {
  readonly oracle: { readonly commit: string };
  readonly format: string;
  /** kind -> positional slot count, as the generator swept it. */
  readonly kinds: Readonly<Record<string, number>>;
  readonly rowCount: number;
  readonly rendersCount: number;
  readonly rows: readonly Row[];
}

const fixture = JSON.parse(
  readFileSync(join(__dirname, "degenerate-fixtures.json"), "utf8"),
) as Fixture;

/**
 * The degenerate values, in the generator's order. `false`, `0` and `""`
 * separate Ruby-falsy from JavaScript-falsy; nil and [] separate present from
 * absent.
 */
const DEGENERATE: Readonly<Record<string, unknown>> = {
  nil: null,
  false: false,
  true: true,
  zero: 0,
  "empty-string": "",
  "empty-array": [],
  node: undefined, // replaced by NODE_FOR's own symbol
};

const label = (kind: string, slot: number, value: string): string => `${kind}[${slot}]=${value}`;

/**
 * The matrix this file requires the sweep to contain, built from `NODE_FOR` and
 * `DEGENERATE` — neither of which any generator writes. This is what makes a
 * truncated fixture fail: its rows are compared against this, not against a
 * count it carries itself.
 */
const EXPECTED_MATRIX: readonly string[] = Object.entries(NODE_FOR).flatMap(([kind, spec]) =>
  Array.from({ length: spec.arity }, (_, slot) => slot).flatMap((slot) =>
    Object.keys(DEGENERATE).map((value) => label(kind, slot, value)),
  ),
);

const rowLabels = fixture.rows.map((r) => label(r.kind, r.slot, r.value));

describe(`${FORMAT} degenerate-slot fixture covers the whole matrix`, () => {
  it("came from the pinned oracle, and is not empty", () => {
    expect(fixture.format).toBe(FORMAT);
    expect(fixture.rows.length).toBeGreaterThan(0);
    expect(fixture.oracle.commit).toBe(loadPinnedCorpus().provenance.oracleCommit);
  });

  it("sweeps exactly the kinds NODE_FOR can build", () => {
    expect(
      Object.keys(fixture.kinds).sort(),
      "a kind in one table and not the other renders its rows meaningless — " +
        "add the builder to NODE_FOR, or drop the kind from KINDS and regenerate",
    ).toEqual(Object.keys(NODE_FOR).sort());
  });

  it("agrees with NODE_FOR on every kind's arity", () => {
    for (const [kind, spec] of Object.entries(NODE_FOR)) {
      expect(fixture.kinds[kind], `${kind} arity`).toBe(spec.arity);
    }
  });

  it("holds one row per kind × slot × value, and no more", () => {
    expect(new Set(rowLabels).size, "duplicate rows").toBe(rowLabels.length);
    expect([...rowLabels].sort()).toEqual([...EXPECTED_MATRIX].sort());
  });

  it("its metadata counts its own rows", () => {
    expect(fixture.rowCount, "rowCount").toBe(fixture.rows.length);
    expect(fixture.rowCount, "rowCount vs the kind × slot × value matrix").toBe(
      EXPECTED_MATRIX.length,
    );
    expect(fixture.rendersCount, "rendersCount").toBe(fixture.rows.filter((r) => r.renders).length);
  });

  it("records an output for every render and an error for every refusal", () => {
    for (const row of fixture.rows) {
      const at = label(row.kind, row.slot, row.value);
      expect(typeof row.output === "string", `${at} renders=${row.renders}, output`).toBe(
        row.renders,
      );
      expect(typeof row.error === "string", `${at} renders=${row.renders}, error`).toBe(
        !row.renders,
      );
    }
  });

  it("every row in DEGENERATE_REFUSES is a row the sweep contains", () => {
    const known = new Set(rowLabels);
    for (const at of Object.keys(DEGENERATE_REFUSES)) {
      expect(known.has(at), `DEGENERATE_REFUSES names ${at}, which the sweep has no row for`).toBe(
        true,
      );
    }
  });

  it("every row in DEGENERATE_DIVERGENCES is a row the sweep contains and the gem renders", () => {
    const byLabel = new Map(fixture.rows.map((r) => [label(r.kind, r.slot, r.value), r] as const));
    for (const at of Object.keys(DEGENERATE_DIVERGENCES)) {
      const row = byLabel.get(at);
      expect(
        row,
        `DEGENERATE_DIVERGENCES names ${at}, which the sweep has no row for`,
      ).toBeDefined();
      // A divergence needs the gem's bytes to differ FROM. A row the gem
      // refuses has none, so naming it here could never fail.
      expect(row?.renders, `${at} is pinned as a divergence but the gem refuses it`).toBe(true);
      expect(Object.hasOwn(DEGENERATE_REFUSES, at), `${at} cannot both diverge and refuse`).toBe(
        false,
      );
    }
  });
});

describe(`${FORMAT} degenerate-slot parity`, () => {
  it.each(fixture.rows.map((r) => [label(r.kind, r.slot, r.value), r] as const))(
    "%s reproduces the gem's bytes, or refuses where the gem does",
    (at, row) => {
      const spec = NODE_FOR[row.kind];
      if (spec === undefined) {
        // Never a silent `return`: that is what let `power` report green.
        throw new Error(
          `${at}: scripts/probe-degenerate-slots.rb sweeps "${row.kind}" and NODE_FOR ` +
            "cannot build it, so this row asserts nothing. Add the builder.",
        );
      }
      const node = spec.build(row.slot, DEGENERATE[row.value]);

      const why = DEGENERATE_REFUSES[at];
      if (why !== undefined) {
        expect(
          row.renders,
          `${at} is pinned as a port refusal, but the gem refuses it too — drop it from DEGENERATE_REFUSES`,
        ).toBe(true);
        expect(
          () => RENDER(node as never),
          `${at} is pinned as a port refusal (${why}) but now renders — drop it from DEGENERATE_REFUSES`,
        ).toThrow(RenderError);
        return;
      }

      if (!row.renders) {
        expect(
          () => RENDER(node as never),
          `${at}: the gem raises ${row.error}; the port must refuse it too`,
        ).toThrow(RenderError);
        return;
      }

      // Unguarded on purpose: a refusal here throws out of the test named for
      // this row, rather than being counted somewhere else.
      const actual = RENDER(node as never);

      const divergence = DEGENERATE_DIVERGENCES[at];
      if (divergence !== undefined) {
        expect(actual, `${at}: ${divergence.reason}`).toBe(divergence.portOutput);
        expect(
          actual,
          `${at} now matches the gem — drop it from DEGENERATE_DIVERGENCES (${divergence.reason})`,
        ).not.toBe(row.output);
        return;
      }

      expect(actual).toBe(row.output);
    },
  );
});
