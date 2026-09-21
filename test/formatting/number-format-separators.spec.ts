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
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../src/core/errors";
import { applyNumberFormat, resolveNumberFormat } from "../../src/formatting/index";

function render(options: Record<string, unknown>): string {
  const format = resolveNumberFormat({ options: options as never }, "asciimath");
  if (format === null) throw new Error("resolveNumberFormat must not be null here");
  return applyNumberFormat("1234.56789", format);
}

describe("explicit null separators mirror the oracle's nil", () => {
  it.each([
    ["decimal", "1,234567'89"],
    ["fractionGroup", "1,234.56789"],
    ["group", "1,234.567'89"],
  ])("%s: null", (key, expected) => {
    expect(render({ [key]: null })).toBe(expected);
  });
});

describe("Boolean separators are refused as the oracle's ConfigurationError", () => {
  it.each([
    ["decimal", true],
    ["decimal", false],
    ["group", true],
    ["group", false],
    ["fractionGroup", true],
    ["fractionGroup", false],
  ])("%s: %s", (key, value) => {
    expect(() => render({ [key]: value, fractionGroupDigits: 2 })).toThrow(RenderError);
  });
});
