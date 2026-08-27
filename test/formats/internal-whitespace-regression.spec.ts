import { describe, expect, it } from "vitest";
import { toAsciimath } from "../../src/formats/asciimath/renderer";
import { toLatex } from "../../src/formats/latex/renderer";

/**
 * PR #10 review, finding 1: `rubyStrip`'s end-anchored trailing regex had no
 * start anchor. A validator-passing `int` whose third slot is a formula of N
 * bare (nil-rendering) fontStyle children then a symbol renders one internal
 * space per child; the regex made every position in that run a retry point.
 * The result was quadratic, while the gem's C-implemented `strip` is linear.
 *
 * A single wall-clock sample proves only that this fixed-size render finished
 * within the budget on this run; it does not prove asymptotic linearity. A
 * two-size ratio was rejected because a load shift between samples can make
 * either implementation look better or worse. The size and budget instead
 * separate the known quadratic implementation while leaving host-load margin.
 *
 * Calibration on 2026-08-27 with Node 26.1.0, index scan / historical regex:
 * AsciiMath 102.33 / 9,342.62 ms; LaTeX 91.95 / 9,129.11 ms. These figures
 * describe that runtime and measurement run, not every machine or invocation.
 */
const CASES = [
  ["AsciiMath", toAsciimath, "int "],
  ["LaTeX", toLatex, "\\int "],
] as const;

describe("rubyStrip's internal-whitespace regression", () => {
  it.each(CASES)(
    "finishes the 80k %s internal-whitespace regression case within 2 seconds",
    (format, render, prefix) => {
      const children: unknown[] = [];
      for (let i = 0; i < 80_000; i += 1) children.push({ kind: "fontStyle" });
      children.push({ kind: "symbol", value: "x" });
      const tree = { kind: "int", parameterThree: { kind: "formula", value: children } };
      const started = performance.now();
      const out = render(tree as never);
      const elapsed = performance.now() - started;
      expect(out).toBe(`${prefix}${" ".repeat(80_000)}x`);
      expect(elapsed, `80k ${format} render took ${elapsed.toFixed(2)} ms`).toBeLessThan(2_000);
    },
  );
});
