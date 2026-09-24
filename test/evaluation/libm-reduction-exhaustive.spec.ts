/**
 * Checks the committed summary `scripts/measure-libm-reduction-exhaustive.mjs`
 * writes (`test/evaluation/libm-reduction-exhaustive.json`) WITHOUT
 * re-measuring. That script compared the port with glibc on EVERY double
 * `0 < |x| < 1024` within `2^-35` of a nonzero multiple of `pi/2` — the
 * region `libm.ts` no longer reduction-guards — and this makes checked facts
 * of what `libm.ts` relies on there:
 *
 * - the measurement found no argument where the port's default behaviour
 *   answers something other than glibc's double;
 * - the arguments it found glibc wrong on outside the band are exactly the
 *   committed `MEASURED_RESULTS`, each sign its own entry, and the port
 *   answers each with the glibc bits the measurement recorded;
 * - `sin(pi)`, `cos(pi/2)`, `tan(pi/2)`, `sin(2pi)` and `tan(6pi)` answer
 *   with glibc's recorded double.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CORRECTLY_ROUNDED, SMALL_ARGUMENT } from "../../src/evaluation/libm";
import { MEASURED_RESULTS } from "../../src/evaluation/libm-measured-results";

type Trig = "sin" | "cos" | "tan";

interface Summary {
  readonly limit: number;
  readonly guardBits: number;
  readonly doubles: number;
  readonly functions: Readonly<
    Record<Trig, { readonly points: number; readonly defaultDisagreements: number }>
  >;
  readonly measuredResults: Readonly<Record<Trig, readonly (readonly [string, string])[]>>;
  readonly named: Readonly<Record<string, { readonly inRegion: boolean; readonly glibc: string }>>;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const summary = JSON.parse(
  readFileSync(join(HERE, "libm-reduction-exhaustive.json"), "utf8"),
) as Summary;

function fromHex(hex: string): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, BigInt(`0x${hex}`));
  return view.getFloat64(0);
}

function hexOf(x: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  return view.getBigUint64(0).toString(16).padStart(16, "0");
}

const TRIG: readonly Trig[] = ["sin", "cos", "tan"];

describe("libm.ts below SMALL_ARGUMENT near multiples of pi/2 (exhaustive measurement)", () => {
  it("covered the region libm.ts leaves unguarded", () => {
    expect(summary.limit).toBe(SMALL_ARGUMENT);
    expect(summary.guardBits).toBe(35);
    expect(summary.doubles).toBeGreaterThan(1_000_000);
  });

  it.each(TRIG)("%s: no argument where the port answered other than glibc", (fn) => {
    expect(summary.functions[fn].points).toBe(2 * summary.doubles);
    expect(summary.functions[fn].defaultDisagreements).toBe(0);
  });

  it.each(TRIG)("%s: the measured table is the one committed, and answers glibc's bits", (fn) => {
    const recorded = summary.measuredResults[fn];
    const committed = [...MEASURED_RESULTS[fn]].map(([x, g]) => [
      x.toString(16).padStart(16, "0"),
      g.toString(16).padStart(16, "0"),
    ]);
    expect(committed.sort()).toEqual([...recorded].map((pair) => [...pair]).sort());
    for (const [x, glibc] of recorded) {
      expect(hexOf(CORRECTLY_ROUNDED[fn](fromHex(x))), `${fn}(${fromHex(x)})`).toBe(glibc);
    }
  });

  it("measured both signs of every table entry, each against glibc", () => {
    expect(summary.measuredResults.sin).toEqual([]);
    expect(summary.measuredResults.cos.length).toBe(2);
    expect(summary.measuredResults.tan.length).toBe(4);
    for (const fn of TRIG) {
      const inputs = new Set(summary.measuredResults[fn].map(([x]) => x));
      for (const x of inputs) expect(inputs.has(hexOf(-fromHex(x))), `${fn} ${x}`).toBe(true);
    }
  });

  it.each([
    ["sin(pi)", "sin", Math.PI],
    ["cos(pi/2)", "cos", Math.PI / 2],
    ["tan(pi/2)", "tan", Math.PI / 2],
    ["sin(2pi)", "sin", 2 * Math.PI],
  ] as const)("%s answers with glibc's double", (label, fn, x) => {
    const recorded = summary.named[label];
    expect(recorded?.inRegion).toBe(true);
    expect(hexOf(CORRECTLY_ROUNDED[fn](x))).toBe(recorded?.glibc);
  });

  it("tan(6pi), which glibc misses outside the band, answers with glibc's double", () => {
    const recorded = summary.named["tan(6pi)"];
    expect(recorded?.inRegion).toBe(true);
    expect(hexOf(CORRECTLY_ROUNDED.tan(6 * Math.PI))).toBe(recorded?.glibc);
    expect(() => CORRECTLY_ROUNDED.tan(6 * Math.PI, null)).not.toThrow();
    expect(hexOf(CORRECTLY_ROUNDED.tan(6 * Math.PI, null))).not.toBe(recorded?.glibc);
  });
});
