/**
 * Checks the committed corpus `scripts/measure-libm-glibc-accuracy.mjs`
 * writes (`test/evaluation/libm-rounding-band-corpus.json`, `libm.ts`'s
 * header) WITHOUT re-measuring: no `ruby` subprocess, no re-sampling. Each
 * row is one sampled argument with glibc's answer (the oracle host's Ruby
 * `Math.<fn>`) and the correctly rounded double from an independent
 * BigDecimal reference, and this makes three things checked facts rather
 * than a comment's claims:
 *
 * - the port's correctly rounded result, band off, IS the reference's, for
 *   every row — the BigInt implementation is right on its own terms;
 * - with its default behaviour (the region's band; for sin/cos/tan, the
 *   reduction guard and the measured-results table), the port either
 *   refuses or returns exactly glibc's double — never a third answer — so
 *   where glibc missed the correctly rounded double, it refuses, or, for a
 *   measured argument, answers glibc's own;
 * - the bands the corpus was measured against are the bands `libm.ts` uses,
 *   and the full measurement found no disagreement outside them.
 *
 * Re-running the measurement (another seed, a wider sample, another
 * platform) is the script's job: it takes a BigDecimal reference per sample
 * and is meant to be run deliberately, not on every `vitest` invocation.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BANDS, CORRECTLY_ROUNDED, type LibmFunction } from "../../src/evaluation/libm";

type Row = readonly [
  category: string,
  x: string,
  glibc: string,
  reference: string,
  distance: number,
];

interface CategorySummary {
  readonly n: number;
  readonly glibcCorrectlyRounded: number;
  readonly misses: number;
  readonly worstMissDistance: number;
  readonly refused: number;
  readonly outOfBandDisagreements: number;
}

interface FunctionCorpus {
  readonly bandInverse: { readonly small: number; readonly large: number } | null;
  readonly summary: Readonly<Record<string, CategorySummary>>;
  readonly rows: readonly Row[];
}

interface Corpus {
  readonly seed: number;
  readonly uniformCount: number;
  readonly functions: Readonly<Record<string, FunctionCorpus>>;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(
  readFileSync(join(HERE, "libm-rounding-band-corpus.json"), "utf8"),
) as Corpus;

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

/** The port's answer with its band on, or `"refused"`. */
function banded(fn: LibmFunction, x: number): string {
  try {
    return hexOf(CORRECTLY_ROUNDED[fn](x));
  } catch (error) {
    if ((error as { code?: string }).code === "UNSUPPORTED_FEATURE") return "refused";
    throw error;
  }
}

const LIBM_FUNCTIONS = Object.keys(BANDS) as LibmFunction[];

describe("libm.ts against the glibc corpus (scripts/measure-libm-glibc-accuracy.mjs)", () => {
  it("covers every banded function and sqrt", () => {
    expect(Object.keys(corpus.functions).sort()).toEqual([...LIBM_FUNCTIONS, "sqrt"].sort());
  });

  it.each(LIBM_FUNCTIONS)("%s: the corpus was measured at the bands libm.ts uses", (fn) => {
    expect(corpus.functions[fn]?.bandInverse).toEqual({
      small: Number(BANDS[fn].small.inverse),
      large: Number(BANDS[fn].large.inverse),
    });
  });

  it.each([...LIBM_FUNCTIONS, "sqrt"])(
    "%s: the full measurement found no disagreement with glibc it did not refuse",
    (fn) => {
      const summary = corpus.functions[fn]?.summary ?? {};
      expect(Object.keys(summary).length).toBeGreaterThan(0);
      for (const [category, figures] of Object.entries(summary)) {
        expect(figures.outOfBandDisagreements, `${fn} ${category}`).toBe(0);
      }
      expect(summary.uniform?.n, fn).toBe(corpus.uniformCount);
    },
  );

  it.each(LIBM_FUNCTIONS)("%s: every committed row agrees with the reference and glibc", (fn) => {
    const rows = corpus.functions[fn]?.rows ?? [];
    expect(rows.length).toBeGreaterThan(0);
    const failures: string[] = [];
    for (const [category, xHex, glibc, reference] of rows) {
      const x = fromHex(xHex);
      const unbanded = hexOf(CORRECTLY_ROUNDED[fn](x, null));
      if (unbanded !== reference) {
        failures.push(`${category} ${x}: port ${unbanded} != ${reference}`);
      }
      const answer = banded(fn, x);
      if (answer !== "refused" && answer !== glibc) {
        failures.push(`${category} ${x}: port ${answer} != glibc ${glibc}`);
      }
      // Where glibc missed, the port refuses — or, for an argument in the
      // exhaustively measured table (`libm-measured-results.ts`), answers
      // glibc's own double, which the check above already requires.
      if (glibc !== reference && answer !== "refused" && answer !== glibc) {
        failures.push(`${category} ${x}: glibc missed and the port answered otherwise`);
      }
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });

  it("sqrt: Math.sqrt is glibc's sqrt on every committed row", () => {
    const rows = corpus.functions.sqrt?.rows ?? [];
    expect(rows.length).toBeGreaterThan(0);
    for (const [category, xHex, glibc, reference] of rows) {
      const x = fromHex(xHex);
      expect(glibc, `${category} ${x}`).toBe(reference);
      expect(hexOf(Math.sqrt(x)), `${category} ${x}`).toBe(glibc);
    }
  });
});
