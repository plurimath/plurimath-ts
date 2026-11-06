/**
 * Inputs whose Ruby model changed when the oracle pin moved to plurimath
 * 2967dcc4. The historical reachability, scope-gap and XML-origin projections
 * were measured at 00c52783 and record the old model (a raw parse hash left in
 * the formula, or a refusal). The current model is measured by
 * `scripts/generate-unicodemath-model-fixtures.rb` in its "pin-2967dcc4"
 * coverage group, and `model-parity.spec.ts` compares the port against it.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

export const SUPERSEDED_AT_PIN: ReadonlySet<string> = new Set([
  "a ± b",
  "a ∓ b",
  "±±a",
  "±+a",
  "±+a#eq",
  "a ± b#eq",
  '\\mup"x"',
  '\\mbf"x"',
  '\\mup100 \\mbf"a" \\mit"a" \\mbfit"a" \\Bbb"a" \\mbffrak"a" \\mscr"a" \\mbfscr"a" \\mfrak"a" \\msans"a" \\mbfsans"a" \\mitsans"a" \\mbfitsans"a" ￗ("a")',
]);

interface ModelRow {
  readonly input: string;
  readonly model?: unknown;
  readonly raises?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
const current = (
  JSON.parse(readFileSync(join(here, "model-fixtures.json"), "utf8")) as {
    readonly cases: readonly ModelRow[];
  }
).cases;

/**
 * Each superseded input a projection carries has a current-pin model row, and
 * that row differs from the historical recording, so the exclusion cannot hide
 * an input whose behaviour did not change.
 */
export function expectSupersededAtPin(
  rows: readonly { readonly input: string; readonly model?: unknown; readonly raises?: string }[],
): number {
  const superseded = rows.filter((row) => SUPERSEDED_AT_PIN.has(row.input));
  for (const row of superseded) {
    const now = current.find((entry) => entry.input === row.input);
    expect(now?.model, row.input).toBeDefined();
    expect(
      row.raises !== undefined || JSON.stringify(row.model) !== JSON.stringify(now?.model),
      row.input,
    ).toBe(true);
  }
  return superseded.length;
}
