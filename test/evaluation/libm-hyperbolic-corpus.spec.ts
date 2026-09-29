/**
 * Checks the committed corpus `scripts/measure-libm-hyperbolic-glibc.mjs`
 * writes (`test/evaluation/libm-hyperbolic-corpus.json`) WITHOUT re-measuring:
 * no `ruby` subprocess. The corpus records, per function (`sinh`, `cosh`,
 * `tanh`) and per region of `libm-hyperbolic.ts`'s `REGIONS`, the measured
 * counts and sampled rows `[argument, glibc's result, 1.0 / result]` (or
 * `"ZeroDivision"`, where the gem's `divide` raises), and this makes these
 * checked facts:
 *
 * - the corpus was measured against the regions in the source now;
 * - a region that never calls `exp` refused nothing;
 * - the port answers glibc's double, bit for bit, on every stored answered
 *   row, and its reciprocal (`sech`/`csch`/`coth`) is Ruby's;
 * - it refuses every stored refused row;
 * - the recorded measurement found no mismatch with Ruby and no reciprocal
 *   mismatch, over at least 300,000 answered arguments per function. These
 *   are the recorded figures, re-derived only by re-running the script.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UnsupportedFeatureError } from "../../src/core/errors";
import { type HyperbolicFunction, hyperbolic, REGIONS } from "../../src/evaluation/libm-hyperbolic";

type Row = readonly [x: string, glibc: string, reciprocal: string];

interface RegionFigures {
  readonly name: string;
  readonly path: string;
  readonly n: number;
  readonly refused: number;
  readonly answeredRows: readonly Row[];
  readonly refusedRows: readonly Row[];
}

interface FunctionFigures {
  readonly samples: number;
  readonly answered: number;
  readonly refused: number;
  readonly mismatches: number;
  readonly reciprocalMismatches: number;
  readonly regions: readonly RegionFigures[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(HERE, "libm-hyperbolic-corpus.json"), "utf8")) as {
  readonly functions: Readonly<Record<HyperbolicFunction, FunctionFigures>>;
};
const FUNCTIONS: readonly HyperbolicFunction[] = ["sinh", "cosh", "tanh"];

const view = new DataView(new ArrayBuffer(8));
function fromHex(hex: string): number {
  view.setBigUint64(0, BigInt(`0x${hex}`));
  return view.getFloat64(0);
}
function hexOf(x: number): string {
  view.setFloat64(0, x);
  return view.getBigUint64(0).toString(16).padStart(16, "0");
}
/** Bit-identical, or both `NaN` (whose payload glibc and V8 need not share). */
function sameDouble(actual: number, expectedHex: string): boolean {
  return (
    hexOf(actual) === expectedHex || (Number.isNaN(actual) && Number.isNaN(fromHex(expectedHex)))
  );
}

describe.each(FUNCTIONS)("libm-hyperbolic-corpus.json: %s", (fn) => {
  const figures = corpus.functions[fn];

  it("records a measurement with no mismatch, over at least 300,000 answered arguments", () => {
    expect(figures.answered).toBeGreaterThanOrEqual(300_000);
    expect(figures.answered + figures.refused).toBe(figures.samples);
    expect(figures.mismatches).toBe(0);
    expect(figures.reciprocalMismatches).toBe(0);
  });

  it("was measured against the regions in the source", () => {
    expect(figures.regions.map((r) => [r.name, r.path])).toEqual(
      REGIONS[fn].map((r) => [r.name, r.path]),
    );
  });

  it("refused nothing in a region that never calls exp", () => {
    for (const region of figures.regions) {
      expect(region.n, region.name).toBeGreaterThan(0);
      if (region.path === "direct" || region.path === "expm1") {
        expect(region.refused, region.name).toBe(0);
        expect(region.refusedRows, region.name).toEqual([]);
      }
    }
  });

  it("answers glibc's double, and Ruby's reciprocal, on every answered row", () => {
    for (const region of figures.regions) {
      for (const [x, glibc, reciprocal] of region.answeredRows) {
        const port = hyperbolic(fn, fromHex(x));
        expect(sameDouble(port, glibc), `${region.name} ${x}`).toBe(true);
        expect(port === 0 ? "ZeroDivision" : hexOf(1 / port), `${region.name} ${x}`).toBe(
          reciprocal,
        );
      }
    }
    expect(figures.regions.some((r) => r.answeredRows.length > 0)).toBe(true);
  });

  it("refuses every refused row", () => {
    for (const region of figures.regions) {
      for (const [x] of region.refusedRows) {
        expect(() => hyperbolic(fn, fromHex(x)), `${region.name} ${x}`).toThrow(
          UnsupportedFeatureError,
        );
      }
    }
  });
});
