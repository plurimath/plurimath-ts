/**
 * Degenerate-slot sweep against the pinned oracle.
 *
 * Every parity defect found in the OMML review lived in a slot the conformance
 * corpus never constructs — nil, false, an empty array — and ARCHITECTURE.md
 * section 5 states hand-built trees are a SUPPORTED use. Five of eight shared one
 * root cause: Ruby-falsy is {nil, false}; JavaScript-falsy also swallows 0 and "".
 *
 * Fixtures are generated, never hand-typed:
 *   ruby scripts/probe-degenerate-slots.rb --oracle <clean checkout> \
 *        --format html --out test/formats/html/degenerate-fixtures.json
 *
 * What is asserted:
 *
 *   1. **The sweep covers every LANDED renderer.** This file reads the
 *      `src/render/<kind>/<format>.ts` inventory itself — the same tree
 *      `pnpm boundaries` gates — and fails naming any renderer no entry in
 *      `NODE_FOR` covers. Both tables used to be hand lists holding 20 of the 38
 *      landed HTML renderers, so `renderMpadded` could be replaced wholesale by
 *      `__BROKEN_MPADDED_HTML__` with both parity specs green at 319/319, while
 *      the `corpus-conformance` gate described itself as covering "every landed
 *      renderer".
 *   2. **The fixture is the whole matrix.** `NODE_FOR` (in `parity-target.ts`)
 *      and `DEGENERATE` (below) are hand-maintained and no generator writes
 *      them, so the entry × slot × value grid they describe is an independent
 *      statement of what the sweep must contain. Every row is checked against
 *      it, and the fixture's own counts are checked against its own rows. A
 *      reviewer cut the fixture from 196 rows to ONE, left `rowCount: 196`, and
 *      both specs still passed 94 tests. Nothing read that number.
 *   3. **An entry the generator sweeps and `NODE_FOR` cannot build FAILS.** It
 *      used to `return`, so `power`'s 14 rows reported green while asserting
 *      nothing at all, under a header claiming every kind × slot was covered.
 *   4. **Bytes, not booleans.** Where the gem renders, the port must reproduce
 *      its exact output. This compared render-versus-throw only: replacing every
 *      rendered result in the fixture with the literal "__BROKEN_HTML__" left
 *      all 198 tests green.
 *   5. Every departure is NAMED, never counted: `DEGENERATE_REFUSES` (the gem
 *      renders, the port refuses), `DEGENERATE_PORT_RENDERS` (the gem refuses,
 *      the port renders — pinned with the port's exact bytes),
 *      `PORT_TYPE_REFUSES` (the port's constructor refuses the value) and
 *      `UNSTABLE_OUTPUT` (the gem's own output is not reproducible).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NODE_KINDS, RenderError } from "../../../src/core/index";
import { loadPinnedCorpus } from "../../core/corpus-pin";
import {
  DEGENERATE_PORT_RENDERS,
  DEGENERATE_REFUSES,
  FORMAT,
  NODE_FOR,
  PORT_TYPE_REFUSES,
  RENDER,
  UNSTABLE_OUTPUT,
} from "./parity-target";

interface Row {
  readonly kind: string;
  readonly slot: number;
  readonly value: string;
  /** False where the gem's own constructor refused the arguments. */
  readonly constructs: boolean;
  readonly renders?: boolean;
  readonly output?: string;
  readonly error?: string;
  readonly constructError?: string;
  /** Present, and false, only where two probes of the cell disagreed. */
  readonly stable?: boolean;
}

interface SweptEntry {
  readonly renderKind: string;
  readonly rubyClass: string;
  readonly slots: readonly string[];
}

interface Fixture {
  readonly generator: { readonly script: string; readonly sha256: string };
  readonly oracle: { readonly commit: string };
  readonly format: string;
  /** The landed renderers the generator derived, as it derived them. */
  readonly inventory: readonly string[];
  readonly kinds: Readonly<Record<string, SweptEntry>>;
  readonly rowCount: number;
  readonly constructsCount: number;
  readonly rendersCount: number;
  readonly unstableCount: number;
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

/** `font-style` (a src/render directory) names the dispatch key `fontStyle`. */
const kindFromDirectory = (name: string): string =>
  name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());

/**
 * Every landed renderer of this format, read off the tree `pnpm boundaries`
 * gates. Derived here rather than taken from the fixture: a generator that
 * omitted a renderer would otherwise omit it from its own inventory too, and
 * agree with itself.
 */
const landedRenderers = (): readonly string[] => {
  const root = resolve(__dirname, "..", "..", "..", "src", "render");
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, `${FORMAT}.ts`)))
    .map((entry) => kindFromDirectory(entry.name))
    .sort();
};

/**
 * The matrix this file requires the sweep to contain, built from `NODE_FOR` and
 * `DEGENERATE` — neither of which any generator writes. This is what makes a
 * truncated fixture fail: its rows are compared against this, not against a
 * count it carries itself.
 */
const EXPECTED_MATRIX: readonly string[] = Object.entries(NODE_FOR).flatMap(([kind, spec]) =>
  spec.slots.flatMap((_filler, slot) =>
    Object.keys(DEGENERATE).map((value) => label(kind, slot, value)),
  ),
);

const rowLabels = fixture.rows.map((r) => label(r.kind, r.slot, r.value));
const rowLabelSet = new Set(rowLabels);

describe(`${FORMAT} degenerate-slot sweep covers every landed renderer`, () => {
  it("finds a non-empty render inventory", () => {
    // A sweep of nothing is a failure, not a pass: this repository has shipped a
    // gate that cruised zero modules and reported success.
    expect(landedRenderers().length).toBeGreaterThan(0);
  });

  it("finds no render directory outside the node model", () => {
    const kinds: readonly string[] = NODE_KINDS;
    const strays = landedRenderers().filter((kind) => !kinds.includes(kind));
    expect(strays, "src/render holds a directory no NodeKind names").toEqual([]);
  });

  it("agrees with the generator on what is landed", () => {
    expect(fixture.inventory, "the generator swept a different tree than this spec reads").toEqual(
      landedRenderers(),
    );
  });

  it("has a sweep entry for every landed renderer", () => {
    const covered: readonly string[] = [
      ...new Set<string>(Object.values(NODE_FOR).map((entry) => entry.renderKind)),
    ].sort();
    const uncovered = landedRenderers().filter((kind) => !covered.includes(kind));
    expect(
      uncovered,
      "these renderers are landed and swept by nothing — a mutation to any of them " +
        "passes both parity specs. Add a NODE_FOR entry and a SWEEP entry.",
    ).toEqual([]);
    expect(covered.filter((kind) => !landedRenderers().includes(kind))).toEqual([]);
  });
});

describe(`${FORMAT} degenerate-slot fixture covers the whole matrix`, () => {
  it("came from the pinned oracle, and is not empty", () => {
    expect(fixture.format).toBe(FORMAT);
    expect(fixture.rows.length).toBeGreaterThan(0);
    expect(fixture.oracle.commit).toBe(loadPinnedCorpus().provenance.oracleCommit);
  });

  it("sweeps exactly the entries NODE_FOR can build", () => {
    expect(
      Object.keys(fixture.kinds).sort(),
      "an entry in one table and not the other renders its rows meaningless — " +
        "add the builder to NODE_FOR, or drop the entry from SWEEP and regenerate",
    ).toEqual(Object.keys(NODE_FOR).sort());
  });

  it("agrees with NODE_FOR on every entry's renderer, Ruby class and slot shape", () => {
    for (const [kind, spec] of Object.entries(NODE_FOR)) {
      const swept = fixture.kinds[kind];
      expect(swept?.renderKind, `${kind} renderKind`).toBe(spec.renderKind);
      expect(swept?.rubyClass, `${kind} rubyClass`).toBe(spec.rubyClass);
      expect(swept?.slots, `${kind} slots`).toEqual(spec.slots);
    }
  });

  it("holds one row per entry × slot × value, and no more", () => {
    expect(rowLabelSet.size, "duplicate rows").toBe(rowLabels.length);
    expect([...rowLabels].sort()).toEqual([...EXPECTED_MATRIX].sort());
  });

  it("its metadata counts its own rows", () => {
    expect(fixture.rowCount, "rowCount").toBe(fixture.rows.length);
    expect(fixture.rowCount, "rowCount vs the entry × slot × value matrix").toBe(
      EXPECTED_MATRIX.length,
    );
    expect(fixture.constructsCount, "constructsCount").toBe(
      fixture.rows.filter((r) => r.constructs).length,
    );
    expect(fixture.rendersCount, "rendersCount").toBe(fixture.rows.filter((r) => r.renders).length);
    expect(fixture.unstableCount, "unstableCount").toBe(
      fixture.rows.filter((r) => r.stable === false).length,
    );
  });

  it("gives every row exactly one well-formed outcome", () => {
    for (const row of fixture.rows) {
      const at = label(row.kind, row.slot, row.value);
      if (row.constructs === false) {
        expect(typeof row.constructError === "string", `${at}: names the constructor's error`).toBe(
          true,
        );
        expect(row.renders, `${at}: a tree the gem cannot build cannot render`).toBeUndefined();
        expect(row.output, `${at}: unbuildable, so no output`).toBeUndefined();
        continue;
      }
      expect(row.constructs, `${at}: constructs`).toBe(true);
      expect(row.constructError, `${at}: built, so no constructor error`).toBeUndefined();
      expect(typeof row.renders === "boolean", `${at}: renders`).toBe(true);
      if (row.renders) {
        expect(row.error, `${at}: rendered, so no error`).toBeUndefined();
        expect(
          (typeof row.output === "string") !== (row.stable === false),
          `${at}: a rendering row carries its bytes unless it is recorded unstable`,
        ).toBe(true);
      } else {
        expect(typeof row.error === "string", `${at}: refused, so it names the error`).toBe(true);
        expect(row.output, `${at}: refused, so no output`).toBeUndefined();
        expect(row.stable, `${at}: refused, so stability is not in question`).toBeUndefined();
      }
    }
  });

  it("records unstable exactly where UNSTABLE_OUTPUT says", () => {
    // The generator earns this flag by probing each cell twice; naming a row
    // here that probes identically twice fails, and so does an unstable row
    // nobody named.
    const unstable = fixture.rows
      .filter((r) => r.stable === false)
      .map((r) => label(r.kind, r.slot, r.value))
      .sort();
    expect(unstable).toEqual(Object.keys(UNSTABLE_OUTPUT).sort());
  });

  it.each([
    ["DEGENERATE_REFUSES", Object.keys(DEGENERATE_REFUSES)],
    ["DEGENERATE_PORT_RENDERS", Object.keys(DEGENERATE_PORT_RENDERS)],
    ["PORT_TYPE_REFUSES", Object.keys(PORT_TYPE_REFUSES)],
    ["UNSTABLE_OUTPUT", Object.keys(UNSTABLE_OUTPUT)],
  ])("every row %s names is a row the sweep contains", (table, keys) => {
    const strays = keys.filter((at) => !rowLabelSet.has(at));
    expect(strays, `${table} names rows the sweep has no row for`).toEqual([]);
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
      const gemRenders = row.renders === true;
      const build = () => spec.build(row.slot, DEGENERATE[row.value]);

      const typeRefusal = PORT_TYPE_REFUSES[at];
      if (typeRefusal !== undefined) {
        expect(
          build,
          `${at} is pinned as a port constructor refusal (${typeRefusal}) but now builds — ` +
            "drop it from PORT_TYPE_REFUSES",
        ).toThrow(TypeError);
        return;
      }

      // Unguarded on purpose: a constructor throw here fails the test named for
      // this row rather than being counted somewhere else.
      const node = build();

      if (row.stable === false) {
        // The gem's own bytes are not reproducible, so no byte claim exists.
        // What is still required is a CLEAN outcome — bytes, or a typed
        // refusal, never an untyped throw.
        let rendered: unknown;
        try {
          rendered = RENDER(node as never);
        } catch (error) {
          expect(error, `${at}: the port must refuse with RenderError, not throw`).toBeInstanceOf(
            RenderError,
          );
          return;
        }
        expect(typeof rendered, `${at}: the port rendered something that is not a string`).toBe(
          "string",
        );
        return;
      }

      const why = DEGENERATE_REFUSES[at];
      if (why !== undefined) {
        expect(
          gemRenders,
          `${at} is pinned as a port refusal, but the gem does not render it — drop it from DEGENERATE_REFUSES`,
        ).toBe(true);
        expect(
          () => RENDER(node as never),
          `${at} is pinned as a port refusal (${why}) but now renders — drop it from DEGENERATE_REFUSES`,
        ).toThrow(RenderError);
        return;
      }

      const inventing = DEGENERATE_PORT_RENDERS[at];
      if (inventing !== undefined) {
        expect(
          gemRenders,
          `${at} is pinned as rendered where the gem refuses, but the gem renders it now — drop it from DEGENERATE_PORT_RENDERS`,
        ).toBe(false);
        // Pinned to the port's exact bytes: "not the gem's output" would accept
        // any corruption at all.
        expect(RENDER(node as never), `${at}: ${inventing.reason}`).toBe(inventing.portOutput);
        return;
      }

      if (row.constructs === false) {
        expect(
          () => RENDER(node as never),
          `${at}: the gem raises ${row.constructError} building this tree, so there is nothing ` +
            "to render; the port must not invent bytes for it",
        ).toThrow(RenderError);
        return;
      }

      if (!gemRenders) {
        expect(
          () => RENDER(node as never),
          `${at}: the gem raises ${row.error}; the port must refuse it too`,
        ).toThrow(RenderError);
        return;
      }

      // Unguarded on purpose: a refusal here throws out of the test named for
      // this row, rather than being counted somewhere else.
      expect(RENDER(node as never)).toBe(row.output);
    },
  );
});
