/**
 * Checks the committed boundary corpus `scripts/measure-pow-rounding-band.mjs`
 * writes (`test/formats/evaluation/pow-rounding-band-corpus.json`, `pow.ts`'s
 * header) — WITHOUT re-measuring: no `ruby` subprocess, no re-sampling. Two
 * things this file makes a checked fact rather than a comment's claim:
 *
 * - every committed boundary pair still makes `correctlyRoundedPow` refuse
 *   (the geometric-proximity band the header describes is still what the
 *   code enforces, not something that quietly drifted);
 * - a hand-picked pair FAR from any boundary (an exact, non-tied integer
 *   power) does not refuse — the band is a band, not "everything refuses".
 *
 * Re-running the measurement itself (a different seed, a wider sample, a
 * different platform) is `scripts/measure-pow-rounding-band.mjs`'s job, not
 * this suite's: that takes a `ruby` subprocess per run and is meant to be run
 * deliberately, not on every `vitest` invocation.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UnsupportedFeatureError } from "../../src/core/errors";
import { correctlyRoundedPow } from "../../src/evaluation/pow";

interface BoundaryPair {
  readonly x: number;
  readonly y: number;
  readonly rubyAnswer: number;
}

interface Corpus {
  readonly seed: number;
  readonly pairCount: number;
  readonly inBandCount: number;
  readonly inBandRate: number;
  readonly outOfBandPortDisagreesWithRubyCount: number;
  readonly committedBoundaryPairCount: number;
  readonly boundaryPairs: readonly BoundaryPair[];
}

const HERE = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(
  readFileSync(
    join(HERE, "..", "formats", "evaluation", "pow-rounding-band-corpus.json"),
    "utf8",
  ),
) as Corpus;

describe("correctlyRoundedPow's boundary corpus (scripts/measure-pow-rounding-band.mjs)", () => {
  it("has committed boundary pairs to check", () => {
    expect(corpus.boundaryPairs.length).toBeGreaterThan(0);
    expect(corpus.boundaryPairs.length).toBe(corpus.committedBoundaryPairCount);
  });

  it("found zero disagreements with Ruby outside the band, over the full sample", () => {
    // The measurement's own correctness check (`pow.ts`'s header): whatever the
    // band's hit rate turns out to be, this module's answer must never have
    // differed from Ruby's own `**` for a pair it did NOT refuse.
    expect(corpus.outOfBandPortDisagreesWithRubyCount).toBe(0);
  });

  it.each(corpus.boundaryPairs.map((pair, index) => [index, pair] as const))(
    "boundary pair #%i refuses",
    (_index, pair) => {
      expect(() => correctlyRoundedPow(pair.x, pair.y)).toThrow(UnsupportedFeatureError);
    },
  );

  it("does not refuse a pair far from any boundary (an exact, non-tied integer power)", () => {
    // 2^10 = 1024, exactly representable, nowhere near a rounding tie.
    expect(correctlyRoundedPow(2, 10)).toBe(1024);
  });
});
