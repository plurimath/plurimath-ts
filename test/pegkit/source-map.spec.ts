/**
 * Offsets reported to callers must index the ORIGINAL input.
 *
 * AsciiMath preprocessing rewrites digraphs to single characters (`{:` → `ℒ`),
 * which shortens the string, so a raw parser offset is wrong by however many
 * rewrites preceded it. Verified against the proof-of-concept: for
 * `"{:x:} + \"unitsml(kg)\""` the drift is two characters.
 */

import { describe, expect, it } from "vitest";
import { SourceMap } from "../../src/pegkit/index";
import type { PreprocessSegment } from "../../src/pegkit/source-map";

/** Minimal stand-in for AsciiMath preprocessing, emitting its segments. */
function preprocess(input: string): { text: string; map: SourceMap } {
  const rewrites: ReadonlyArray<readonly [string, string]> = [
    ["{:", "ℒ"],
    [":}", "ℛ"],
    ["(:", "ᑕ"],
    [":)", "ᑐ"],
  ];
  const segments: PreprocessSegment[] = [];
  let index = 0;
  outer: while (index < input.length) {
    for (const [from, to] of rewrites) {
      if (input.startsWith(from, index)) {
        segments.push({ originStart: index, output: to });
        index += from.length;
        continue outer;
      }
    }
    segments.push({ originStart: index, output: input[index] as string });
    index += 1;
  }
  return {
    text: segments.map((segment) => segment.output).join(""),
    map: SourceMap.fromSegments(segments),
  };
}

describe("SourceMap", () => {
  it("maps offsets back across length-changing rewrites", () => {
    const input = '{:x:} + "unitsml(kg)"';
    const { text, map } = preprocess(input);

    expect(text).toBe('ℒxℛ + "unitsml(kg)"');
    expect(text.length).toBe(input.length - 2);

    const inPreprocessed = text.indexOf("unitsml");
    const inOriginal = input.indexOf("unitsml");
    expect(inPreprocessed).not.toBe(inOriginal); // the drift this guards against
    expect(map.toOriginal(inPreprocessed)).toBe(inOriginal);
  });

  it("is the identity when nothing is rewritten", () => {
    const input = "x^2 + 1";
    const { text, map } = preprocess(input);
    expect(text).toBe(input);
    for (let index = 0; index < input.length; index++) {
      expect(map.toOriginal(index)).toBe(index);
    }
  });

  it("maps every character of a rewritten token to the token's start", () => {
    const { map } = preprocess("{:x");
    expect(map.toOriginal(0)).toBe(0); // ℒ  → the "{" of "{:"
    expect(map.toOriginal(1)).toBe(2); // x  → after the digraph
  });

  it("clamps an offset past the end instead of returning undefined", () => {
    const { text, map } = preprocess("{:x");
    expect(map.toOriginal(text.length)).toBe(3);
  });
});
