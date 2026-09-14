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
import { rubyToI } from "../../src/core/ruby-semantics";

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
