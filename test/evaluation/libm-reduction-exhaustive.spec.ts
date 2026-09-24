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
 * - the exceptions it found (glibc wrong outside the band) are exactly the
 *   committed `REDUCTION_EXCEPTIONS`, and the port refuses each, both signs;
 * - `sin(pi)`, `cos(pi/2)`, `tan(pi/2)` and `sin(2pi)` answer with glibc's
 *   recorded double, and `tan(6pi)` is refused.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UnsupportedFeatureError } from "../../src/core/errors";
import { CORRECTLY_ROUNDED, SMALL_ARGUMENT } from "../../src/evaluation/libm";
import { REDUCTION_EXCEPTIONS } from "../../src/evaluation/libm-reduction-exceptions";

type Trig = "sin" | "cos" | "tan";

interface Summary {
  readonly limit: number;
  readonly guardBits: number;
  readonly doubles: number;
  readonly functions: Readonly<
    Record<Trig, { readonly points: number; readonly defaultDisagreements: number }>
  >;
  readonly exceptions: Readonly<Record<Trig, readonly string[]>>;
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

  it.each(TRIG)("%s: the exceptions found are the committed table, and each refuses", (fn) => {
    const measured = summary.exceptions[fn].map(fromHex);
    expect([...REDUCTION_EXCEPTIONS[fn]].sort((a, b) => a - b)).toEqual(measured);
    for (const x of measured) {
      expect(() => CORRECTLY_ROUNDED[fn](x), `${fn}(${x})`).toThrow(UnsupportedFeatureError);
      expect(() => CORRECTLY_ROUNDED[fn](-x), `${fn}(${-x})`).toThrow(UnsupportedFeatureError);
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

  it("tan(6pi) is refused: glibc misses it outside the band", () => {
    expect(summary.named["tan(6pi)"]?.inRegion).toBe(true);
    expect(() => CORRECTLY_ROUNDED.tan(6 * Math.PI)).toThrow(UnsupportedFeatureError);
  });
});
