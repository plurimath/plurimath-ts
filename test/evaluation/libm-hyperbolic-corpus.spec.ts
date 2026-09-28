/**
 * Checks the committed corpus `scripts/measure-libm-hyperbolic-glibc.mjs`
 * writes (`test/evaluation/libm-hyperbolic-corpus.json`) WITHOUT re-measuring:
 * no `ruby` subprocess. The corpus records, per function (`sinh`, `cosh`,
 * `tanh`) and per region of `libm-hyperbolic.ts`'s `REGIONS`, the measured
 * figures and sampled rows `[argument, glibc's result, 1.0 / result]` (or
 * `"ZeroDivision"`, where the gem's `divide` raises), and this makes these
 * checked facts:
 *
 * - the corpus was measured against the regions and bands in the source now;
 * - every band is at least twice the worst glibc miss measured in its region,
 *   and no banded region has a miss further than the neighbouring doubles;
 * - the port answers glibc's double, bit for bit, on every answered row, and
 *   its reciprocal (`sech`/`csch`/`coth`) is Ruby's;
 * - it refuses every refused row, and every glibc miss stored;
 * - the full measurement found no mismatch with Ruby, no reciprocal
 *   mismatch, and no disagreement with the BigDecimal reference, over at
 *   least 300,000 answered arguments per function.
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
  readonly band: number | null;
  readonly n: number;
  readonly far: number;
  readonly refused: number;
  readonly worstMidpointDistance: number;
  readonly answeredRows: readonly Row[];
  readonly refusedRows: readonly Row[];
  readonly missRows: readonly Row[];
}

interface FunctionFigures {
  readonly samples: number;
  readonly answered: number;
  readonly mismatches: number;
  readonly reciprocalMismatches: number;
  readonly referenceChecked: number;
  readonly referenceDisagreements: number;
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
    expect(figures.mismatches).toBe(0);
    expect(figures.reciprocalMismatches).toBe(0);
    expect(figures.referenceChecked).toBeGreaterThan(0);
    expect(figures.referenceDisagreements).toBe(0);
  });

  it("was measured against the regions and bands in the source", () => {
    expect(figures.regions.map((r) => [r.name, r.band])).toEqual(
      REGIONS[fn].map((r) => [r.name, r.inverse === null ? null : Number(r.inverse)]),
    );
  });

  it("sizes every band at least twice the worst miss measured in its region", () => {
    for (const region of figures.regions) {
      expect(region.n, region.name).toBeGreaterThan(0);
      if (region.band === null) {
        expect(region.refused, region.name).toBe(region.n);
        continue;
      }
      expect(region.far, region.name).toBe(0);
      expect(1 / region.band, region.name).toBeGreaterThanOrEqual(2 * region.worstMidpointDistance);
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

  it("refuses every refused row and every stored glibc miss", () => {
    for (const region of figures.regions) {
      for (const [x] of [...region.refusedRows, ...region.missRows]) {
        expect(() => hyperbolic(fn, fromHex(x)), `${region.name} ${x}`).toThrow(
          UnsupportedFeatureError,
        );
      }
    }
    expect(figures.regions.some((r) => r.missRows.length > 0)).toBe(true);
  });
});
