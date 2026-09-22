/**
 * Separator options (`decimal`, `group`, `fractionGroup`) given as explicit
 * `null` or as a Boolean. Measured on the oracle (00c52783) with
 *
 *   BUNDLE_GEMFILE=~/ruby_gems/plurimath-oracle/Gemfile mise x -- bundle exec ruby -e '
 *     require "plurimath"
 *     p Plurimath::Formatter::Standard.new(options: {decimal: nil})
 *         .localized_number("1234.56789", precision: nil)'
 *
 *   {decimal: nil}        => "1,234567'89"   (no decimal marker at all)
 *   {fraction_group: nil} => "1,234.56789"   (no fraction grouping)
 *   {group: nil}          => "1,234.567'89"  (falls back to the default ",")
 *
 * and, for `{decimal: true}`, `{group: false}` and
 * `{fraction_group: true, fraction_group_digits: 2}`:
 *
 *   Plurimath::ConfigurationError: invalid value true for formatter option :decimal
 *   Plurimath::ConfigurationError: invalid value false for formatter option :group
 *   Plurimath::ConfigurationError: invalid value true for formatter option :fraction_group
 *
 * All five renderers agree byte-for-byte on the digits and separators here —
 * measured directly on this port (no base, no notation in play, so
 * `renderNumberText`'s per-target templates never engage): asciimath, latex,
 * html and unicodemath render the flat text as-is; mathml wraps the SAME text
 * in `<mn>…</mn>` inside its `<mstyle displaystyle="true">`.
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../src/core/errors";
import {
  applyNumberFormat,
  formatNumberForMathml,
  resolveNumberFormat,
  type TextTarget,
} from "../../src/formatting/index";

const FORMATS = ["asciimath", "latex", "mathml", "unicodemath", "html"] as const;

function render(options: Record<string, unknown>, format: (typeof FORMATS)[number]): string {
  const resolved = resolveNumberFormat({ options: options as never }, format);
  if (resolved === null) throw new Error("resolveNumberFormat must not be null here");
  if (format === "mathml") {
    const number = formatNumberForMathml("1234.56789", resolved);
    if (number.kind !== "plain")
      throw new Error(`expected a plain mathml number, got ${number.kind}`);
    return `<mn>${number.text}</mn>`;
  }
  return applyNumberFormat("1234.56789", resolved, format as TextTarget);
}

describe("explicit null separators mirror the oracle's nil, on every format", () => {
  it.each([
    ["decimal", "1,234567'89"],
    ["fractionGroup", "1,234.56789"],
    ["group", "1,234.567'89"],
  ])("%s: null", (key, expected) => {
    for (const format of FORMATS) {
      const want = format === "mathml" ? `<mn>${expected}</mn>` : expected;
      expect(render({ [key]: null }, format), format).toBe(want);
    }
  });
});

describe("Boolean separators are refused as the oracle's ConfigurationError, on every format", () => {
  it.each([
    ["decimal", true],
    ["decimal", false],
    ["group", true],
    ["group", false],
    ["fractionGroup", true],
    ["fractionGroup", false],
  ])("%s: %s", (key, value) => {
    for (const format of FORMATS) {
      expect(() => render({ [key]: value, fractionGroupDigits: 2 }, format), format).toThrow(
        RenderError,
      );
    }
  });
});
