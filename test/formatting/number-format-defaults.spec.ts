/**
 * Unit-level regression coverage for two real gaps a Codex review caught in
 * `src/formatting/number-format.ts`, neither reachable through the
 * oracle-case specs (which don't happen to exercise a fraction longer than
 * one default group, or a leading/all-zero integer):
 *
 * 1. `Formatter::Standard::DEFAULT_OPTIONS` bakes in `fraction_group: "'"`,
 *    `fraction_group_digits: 3` — fraction-side grouping is ON by default,
 *    not off. Live oracle check (pinned, 00c52783): a formatter with no
 *    explicit fraction options renders `"1.123456"` as `"1.123'456"`.
 * 2. `Formatter::Numbers::Parts#normalized` (`parts.rb:63`) strips leading
 *    zeros under an active formatter — `"000"` -> `"0"`, `"007"` -> `"7"` —
 *    which this port didn't do at all. Live oracle check: the SAME input
 *    without a formatter renders unchanged (`"000"` stays `"000"`), so this
 *    must only fire on the formatted path.
 */

import { describe, expect, it } from "vitest";
import { applyNumberFormat, resolveNumberFormat } from "../../src/formatting/index";

function defaultFormat() {
  const format = resolveNumberFormat({}, "asciimath");
  if (format === null) throw new Error("resolveNumberFormat({}, ...) must not be null");
  return format;
}

describe("applyNumberFormat — default fraction-side grouping", () => {
  it('groups fraction digits by 3 with "\'" when no fraction options are given', () => {
    expect(applyNumberFormat("1.123456", defaultFormat())).toBe("1.123'456");
  });

  it("leaves a fraction of exactly one default group ungrouped (no separator needed)", () => {
    expect(applyNumberFormat("1.123", defaultFormat())).toBe("1.123");
  });

  it("still honors an explicit fractionGroup/fractionGroupDigits override", () => {
    const format = resolveNumberFormat(
      { options: { fractionGroup: "_", fractionGroupDigits: 3 } },
      "asciimath",
    );
    if (format === null) throw new Error("resolveNumberFormat must not be null here");
    expect(applyNumberFormat("1.123456789", format)).toBe("1.123_456_789");
  });
});

describe("applyNumberFormat — leading-zero canonicalization under an active formatter", () => {
  it.each([
    ["000", "0"],
    ["00", "0"],
    ["007", "7"],
    ["0", "0"],
  ])("canonicalizes integer digits %s -> %s", (input, expected) => {
    expect(applyNumberFormat(input, defaultFormat())).toBe(expected);
  });

  it("canonicalizes the integer part of a decimal value", () => {
    expect(applyNumberFormat("0000.5", defaultFormat())).toBe("0.5");
  });

  it("canonicalizes an all-zero integer part before a fraction", () => {
    expect(applyNumberFormat("000000", defaultFormat())).toBe("0");
  });

  it("groups correctly after stripping leading zeros", () => {
    expect(applyNumberFormat("0001234567", defaultFormat())).toBe("1,234,567");
  });
});
