/**
 * `rubyToI`: Ruby's `String#to_i`, not JS's `Number()` and not `parseInt`.
 *
 * The four rows below are the ones that actually differ across all three
 * readings — `Number()` fails the whole string on trailing garbage,
 * `parseInt` additionally treats a `"0x"` prefix as hex, and Ruby's `to_i`
 * does neither. `"1e309"` is the case that matters most: `Number("1e309")` is
 * `Infinity`, and a matrix-size loop bounded by that never terminates.
 */

import { describe, expect, it } from "vitest";
import { rubyToI, rubyToInteger } from "../../src/core/ruby-semantics";

describe("rubyToInteger", () => {
  it("is exact past 2**53 and past the double range", () => {
    expect(rubyToInteger("9_007_199_254_740_993")).toBe(9007199254740993n);
    expect(rubyToInteger("-1_0")).toBe(-10n);
    expect(rubyToInteger("1".repeat(400))).toBe(BigInt("1".repeat(400)));
    expect(rubyToI("1".repeat(400))).toBe(Infinity);
    expect(rubyToI(`-${"1".repeat(400)}`)).toBe(-Infinity);
  });
});

describe("rubyToI", () => {
  it.each([
    ["3foo", 3],
    ["2.5", 2],
    ["0x10", 0],
    ["1e309", 1],
    ["  -12x", -12],
    ["+7", 7],
    ["abc", 0],
    ["", 0],
    ["42", 42],
  ] as const)("%s -> %i", (text, expected) => {
    expect(rubyToI(text)).toBe(expected);
  });

  // Each expectation is `String#to_i` on Ruby 4.0.1, measured: a single `_`
  // between digits is a separator; leading, trailing or doubled ends the
  // number; a `0d` prefix after the sign is read. Leading whitespace is
  // Ruby's ASCII set only, not JS's `\s`.
  it.each([
    ["1_0", 10],
    ["1_0_1", 101],
    ["-1_0", -10],
    ["+1_0", 10],
    [" 1_0", 10],
    ["0_1", 1],
    ["1__0", 1],
    ["10_", 10],
    ["1_0_", 10],
    ["1_", 1],
    ["_10", 0],
    ["+_10", 0],
    ["-_10", 0],
    ["_", 0],
    ["1 _0", 1],
    ["1_ 0", 1],
    ["\t10", 10],
    ["\v10", 10],
    ["\u00a010", 0],
    ["\u200310", 0],
    ["\u202810", 0],
    ["0d10", 10],
    ["0D10", 10],
    ["0d1_0", 10],
    ["-0d10", -10],
    ["+0d10", 10],
    [" 0d1", 1],
    ["0d_1", 0],
    ["0d", 0],
    ["0d-1", 0],
    ["0_d1", 0],
    ["00d1", 0],
    ["0dd1", 0],
    ["0d0d1", 0],
    ["+ 12", 0],
    ["1_2__3", 12],
    ["1_.5", 1],
    ["\u0663", 0],
  ] as const)("%j -> %i", (text, expected) => {
    expect(rubyToI(text)).toBe(expected);
  });

  it("disagrees with JS Number() on exactly the cases that matter", () => {
    expect(Number("3foo")).toBeNaN();
    expect(rubyToI("3foo")).toBe(3);

    expect(Number("2.5")).toBe(2.5);
    expect(rubyToI("2.5")).toBe(2);

    expect(Number("0x10")).toBe(16);
    expect(rubyToI("0x10")).toBe(0);

    expect(Number("1e309")).toBe(Infinity);
    expect(rubyToI("1e309")).toBe(1);
  });

  it("disagrees with parseInt on a hex prefix", () => {
    // JS's Number() (not parseInt, which biome's own lint forbids without an
    // explicit radix) already reads the "0x" prefix as hex, giving 16.
    expect(Number("0x10")).toBe(16);
    expect(rubyToI("0x10")).toBe(0);
  });

  it("returns a finite number, never Infinity, for scientific notation", () => {
    const result = rubyToI("1e309");
    expect(Number.isFinite(result)).toBe(true);
  });
});
