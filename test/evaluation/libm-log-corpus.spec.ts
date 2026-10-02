/**
 * Checks the committed corpus `scripts/measure-libm-log-glibc.mjs` writes
 * (`test/evaluation/libm-log-corpus.json`) WITHOUT re-measuring: no `ruby`
 * subprocess. Each row is a sampled argument (or argument and base) with
 * glibc's answer, the oracle host's Ruby `Math.log2`, `Math.log10` or
 * `Math.log(x, base)`, and this makes these checked facts:
 *
 * - `libm-log2.ts`'s `log2` returns glibc's double bit for bit on every row;
 * - `Math.log(x, base)` (`libm.ts`'s `mathLogBase`) does too, never refusing;
 * - `Math.log10` (`mathLog10`) returns glibc's double on every row the
 *   measurement saw it answer, and refuses every row it saw it refuse;
 * - the full measurement the corpus summarizes found no mismatch at all.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UnsupportedFeatureError } from "../../src/core/errors";
import { mathLog10, mathLogBase } from "../../src/evaluation/libm";
import { log2 } from "../../src/evaluation/libm-log2";
import { float } from "../../src/evaluation/numeric";

type ArgumentRow = readonly [x: string, glibc: string];
type PairRow = readonly [x: string, base: string, glibc: string];

interface Corpus {
  readonly summary: Readonly<Record<string, { readonly n: number; readonly mismatches: number }>>;
  readonly log2: Readonly<Record<string, readonly ArgumentRow[]>>;
  readonly log10: Readonly<Record<string, readonly ArgumentRow[]>>;
  readonly logBase: Readonly<Record<string, readonly PairRow[]>>;
}

/** `scripts/measure-libm-log-glibc.mjs`'s `CORPUS_ROWS`. */
const ROWS = 300;

const HERE = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(HERE, "libm-log-corpus.json"), "utf8")) as Corpus;

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

describe("libm-log-corpus.json", () => {
  it("holds every category, with as many rows as the measurement stored", () => {
    const argumentCategories = ["uniform", "near-one", "human", "powers", "edges"];
    const summary = (name: string) => corpus.summary[name] as { n: number; refused?: number };
    expect(Object.keys(corpus.log2).sort()).toEqual([...argumentCategories].sort());
    expect(Object.keys(corpus.log10).sort()).toEqual(
      argumentCategories.flatMap((c) => [c, `${c} refused`]).sort(),
    );
    expect(Object.keys(corpus.logBase).sort()).toEqual(["edges", "mixed"]);
    for (const category of argumentCategories) {
      const log2Figures = summary(`log2 ${category}`);
      const log10Figures = summary(`log10 ${category}`);
      const refused = log10Figures.refused ?? Number.NaN;
      expect(corpus.log2[category]?.length, category).toBe(Math.min(ROWS, log2Figures.n));
      expect(corpus.log10[category]?.length, category).toBe(
        Math.min(ROWS, log10Figures.n - refused),
      );
      expect(corpus.log10[`${category} refused`]?.length, category).toBe(Math.min(ROWS, refused));
    }
    for (const category of ["edges", "mixed"]) {
      const figures = summary(`log(x, base) ${category}`);
      expect(corpus.logBase[category]?.length, category).toBe(Math.min(ROWS, figures.n));
    }
  });

  it("records a measurement with no mismatch", () => {
    const entries = Object.entries(corpus.summary);
    expect(entries.length).toBeGreaterThan(0);
    for (const [name, figures] of entries) {
      expect(figures.n, name).toBeGreaterThan(0);
      expect(figures.mismatches, name).toBe(0);
    }
  });

  it("log2 is glibc's on every row", () => {
    for (const [category, rows] of Object.entries(corpus.log2)) {
      expect(rows.length, category).toBeGreaterThan(0);
      for (const [x, glibc] of rows) {
        expect(sameDouble(log2(fromHex(x)), glibc), `${category} ${x}`).toBe(true);
      }
    }
  });

  it("Math.log(x, base) is glibc's on every row", () => {
    for (const [category, rows] of Object.entries(corpus.logBase)) {
      expect(rows.length, category).toBeGreaterThan(0);
      for (const [x, base, glibc] of rows) {
        const port = mathLogBase(float(fromHex(x)), float(fromHex(base)));
        expect(sameDouble(port, glibc), `${category} ${x} ${base}`).toBe(true);
      }
    }
  });

  it("Math.log10 is glibc's on every answered row, and refused on every refused row", () => {
    const categories = Object.entries(corpus.log10);
    for (const [category, rows] of categories) {
      const refusedCategory = category.endsWith(" refused");
      if (!refusedCategory) expect(rows.length, category).toBeGreaterThan(0);
      for (const [x, glibc] of rows) {
        const run = () => mathLog10(float(fromHex(x)));
        if (refusedCategory) {
          expect(run, `${category} ${x}`).toThrow(UnsupportedFeatureError);
        } else {
          expect(sameDouble(run(), glibc), `${category} ${x}`).toBe(true);
        }
      }
    }
    expect(categories.some(([c, rows]) => c.endsWith(" refused") && rows.length > 0)).toBe(true);
  });
});
