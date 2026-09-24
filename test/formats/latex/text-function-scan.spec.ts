/**
 * `textFunctionSpans` against `Latex::Parser::TEXT_REGEX` (`latex/parser.rb:8`).
 *
 * The scanner replaced a global scan of that regex, which a backtracking engine
 * runs in time quadratic in the number of unclosed `\mbox{` openings. The regex
 * is kept here, and only here, as the reference: every input below must give
 * the same match list from both — the same starts, lengths and order.
 */

import { describe, expect, it } from "vitest";
import { preprocess, textFunctionSpans } from "../../../src/formats/latex/preprocess";

/** The pattern the scanner replaced, verbatim. Test-only: it is the ReDoS. */
const TEXT_REGEX = /\\(?:mbox|text)\{[^}]+\}/g;

function regexSpans(text: string): Array<{ start: number; length: number }> {
  return Array.from(text.matchAll(new RegExp(TEXT_REGEX.source, TEXT_REGEX.flags)), (match) => ({
    start: match.index,
    length: match[0].length,
  }));
}

function scannerSpans(text: string): Array<{ start: number; length: number }> {
  return textFunctionSpans(text).map(({ start, length }) => ({ start, length }));
}

/** mulberry32: a small seeded PRNG, so a failure reproduces from its seed. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = ["\\mbox{", "\\text{", "{", "}", "a", "\\", "m", "t", "b", "o", "x", "e", " "];

describe("textFunctionSpans", () => {
  it.each([
    ["", []],
    ["\\text{}", []],
    ["\\mbox{}", []],
    ["\\text{a}", [[0, 8]]],
    ["\\mbox{a}", [[0, 8]]],
    ["\\text{{}", [[0, 8]]],
    ["\\text{a", []],
    ["\\text{}a}", []],
    ["\\text{\\text{a}}", [[0, 14]]],
    [
      "\\text{a}\\mbox{b}",
      [
        [0, 8],
        [8, 8],
      ],
    ],
    ["\\\\text{a}", [[1, 8]]],
    ["\\Text{a}", []],
    ["\\textbf{a}", []],
    ["\\text {a}", []],
    ["\\mbox{}\\text{x}", [[7, 8]]],
    ["\\text{}}\\text{}x}", []],
    ["\\text{}}\\text{x}", [[8, 8]]],
    ["x\\text{ }y", [[1, 8]]],
    ["\\text{a\\mbox{b}c}", [[0, 15]]],
    ["\\mbox{\\text", []],
    ["\\", []],
    ["\\text", []],
    ["\\text{", []],
    ["\\text{\u{1d400}}", [[0, 9]]],
  ] as const)("%j", (input, expected) => {
    const want = expected.map(([start, length]) => ({ start, length }));
    expect(regexSpans(input)).toEqual(want);
    expect(scannerSpans(input)).toEqual(want);
  });

  it("agrees with the regex on 30,000 seeded random strings", () => {
    const random = mulberry32(0x5eed_7e47);
    let matches = 0;
    let withMatch = 0;
    for (let sample = 0; sample < 30_000; sample++) {
      const tokens = Math.floor(random() * 40);
      let input = "";
      for (let token = 0; token < tokens; token++) {
        input += ALPHABET[Math.floor(random() * ALPHABET.length)];
      }
      const expected = regexSpans(input);
      const actual = scannerSpans(input);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        expect({ sample, input, actual }).toEqual({ sample, input, actual: expected });
      }
      matches += expected.length;
      if (expected.length > 0) withMatch += 1;
    }
    // The corpus must actually exercise matches, not only non-matches.
    expect(withMatch).toBeGreaterThan(5_000);
    expect(matches).toBeGreaterThan(10_000);
  });

  // 50,000 repetitions is 350,000 code units. The regex above is quadratic
  // on it: two runs on this repo's host took 18.5 s and 48.7 s, depending on
  // load. The scanner takes milliseconds, so the bound here is generous and
  // still far under the regex.
  it.each(["\\mbox{{", "\\text{{", "\\mbox{", "\\text{\\mbox{"])(
    "scans 50,000 unclosed %j openings in linear time",
    (opening) => {
      const input = opening.repeat(50_000);
      const began = performance.now();
      const spans = textFunctionSpans(input);
      const elapsed = performance.now() - began;
      expect(spans).toEqual([]);
      expect(elapsed).toBeLessThan(1_000);
    },
  );

  it("keeps preprocess linear on the same input", () => {
    const input = "\\mbox{{".repeat(50_000);
    const began = performance.now();
    preprocess(input);
    expect(performance.now() - began).toBeLessThan(5_000);
  });
});
