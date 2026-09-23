/**
 * B2's numeric-pipeline slice: `precision`, `significant`, `digitCount`,
 * `padding`/`paddingDigits`/`paddingGroupDigits` and `numberSign` of the
 * per-call `formatter:` option — plus, since B2's notation slice, `notation`
 * (`e`/`scientific`/`engineering`), `e`, `times` and `exponentSign` (inline
 * cases: `number-formatter-notation.spec.ts`) and, since the base slice,
 * `base`, `basePrefix`, `basePostfix` and `hexCapital` (base-specific measured
 * cases: `number-formatter-base-notation.spec.ts`; notation with a base:
 * `number-formatter-notation-base.spec.ts`) — against the pinned `calls/1`
 * oracle cases and against values measured directly on the oracle.
 *
 * Three groups:
 *
 * 1. Every pinned `calls/1` case whose options fall in this slice renders
 *    byte-identically for asciimath, latex, mathml, unicodemath and html.
 *    OMML stays refused (another lane's).
 * 2. Every pinned case outside it (base notation, when the pin has any) is
 *    still refused BY NAME, and the refusal names the offending key.
 * 3. Inline cases measured on the oracle (below), and the option refusals.
 */

import { describe, expect, it } from "vitest";
import { RenderError } from "../../src/core/errors";
import type { ConstructedMathNode } from "../../src/core/nodes";
import { toAsciimath } from "../../src/formats/asciimath/index";
import { toHtml } from "../../src/formats/html/index";
import { toLatex } from "../../src/formats/latex/index";
import { toMathml } from "../../src/formats/mathml/index";
import { toOmml } from "../../src/formats/omml/index";
import { toUnicodemath } from "../../src/formats/unicodemath/index";
import {
  applyNumberFormat,
  type FormatterOptions,
  type FormatterSymbolOptions,
  resolveNumberFormat,
} from "../../src/formatting/index";
import { loadPinnedCorpus, type PinnedCallCase } from "../core/corpus-pin";
import type { YamlValue } from "../core/corpus-yaml";
import { aliasIndex, buildNode, readCensus, type SerializedNode } from "../core/model-builder";

type Mapping = { readonly [key: string]: YamlValue };

/** The snake_case option keys (the payload's spelling) this slice implements. */
const IN_SCOPE_KEYS: ReadonlySet<string> = new Set([
  "decimal",
  "group",
  "group_digits",
  "fraction_group",
  "fraction_group_digits",
  "precision",
  "significant",
  "digit_count",
  "padding",
  "padding_digits",
  "padding_group_digits",
  "number_sign",
  "notation",
  "e",
  "times",
  "exponent_sign",
  "base",
  "base_prefix",
  "base_postfix",
  "hex_capital",
]);

function camel(key: string): string {
  return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function asMapping(value: YamlValue, where: string): Mapping {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${where}: expected a mapping`);
  }
  return value as Mapping;
}

/** A pinned case reduced to the formatter it was recorded with. */
interface Reduced {
  readonly entry: PinnedCallCase;
  readonly locale: string;
  readonly stringFormat: YamlValue;
  readonly keys: readonly string[];
  readonly formatter: FormatterOptions;
}

function reduce(entry: PinnedCallCase): Reduced {
  const at = `calls/1 case ${entry.id}`;
  const args = asMapping(entry.call.args, `${at} call.args`);
  const options = asMapping(args.options ?? {}, `${at} call.args.options`);
  const keys = Object.keys(options);
  const converted: Record<string, unknown> = {};
  for (const key of keys) converted[camel(key)] = options[key];
  const precision = args.precision ?? null;
  if (precision !== null && typeof precision !== "number") {
    throw new Error(`${at}: precision must be a number or null`);
  }
  return {
    entry,
    locale: String(args.locale),
    stringFormat: args.string_format ?? null,
    keys,
    formatter: {
      locale: String(args.locale),
      options: converted as FormatterSymbolOptions,
      precision,
      ...(args.string_format === null || args.string_format === undefined
        ? {}
        : { stringFormat: args.string_format as never }),
    },
  };
}

const ALL = loadPinnedCorpus().calls.map(reduce);

/**
 * In scope: only this slice's keys and no `string_format` (B2-O's). Locale is
 * not a filter: `formatter.locale` is inert, as on the oracle, so the `-de-`,
 * `-fr-` and unsupported-locale cases run here like any other.
 */
const IN_SCOPE = ALL.filter(
  (c) => c.keys.every((k) => IN_SCOPE_KEYS.has(k)) && c.stringFormat === null,
);

function buildFormula(entry: PinnedCallCase): ConstructedMathNode {
  const census = readCensus();
  return buildNode(entry.model as unknown as SerializedNode, aliasIndex(census));
}

describe("pinned calls/1 cases — the sets this spec partitions", () => {
  it("has 66 cases, and every one but a string_format case is in scope", () => {
    // 66 is measured, not recalled: the count of `corpus.calls` under the pinned testsuite.
    expect(ALL).toHaveLength(66);
    expect(IN_SCOPE.length).toBeGreaterThan(0);
    for (const c of IN_SCOPE) expect(c.stringFormat).toBeNull();
  });

  it("covers every group of this slice (a gate that inspects nothing fails)", () => {
    const ids = IN_SCOPE.map((c) => c.entry.id);
    for (const stem of [
      "precision-",
      "significant-",
      "digit-count-",
      "sign-plus-basic",
      "padding-",
      "notation-e-",
      "notation-scientific-",
      "notation-engineering-",
      "sign-plus-e",
      "sign-plus-scientific",
      "sign-plus-engineering",
      "base-",
      "locale-de-standard-defaults",
      "locale-fr-standard-defaults",
      "locale-unsupported-falls-back",
      "locale-de-explicit-separators",
    ]) {
      expect(
        ids.some((id) => id.includes(stem)),
        stem,
      ).toBe(true);
    }
  });
});

describe.each(IN_SCOPE.map((c) => [c.entry.id, c] as const))("%s", (_id, c) => {
  const expected = c.entry.expected;
  const formatter = c.formatter;

  it("renders asciimath byte-identical to the oracle", () => {
    expect(toAsciimath(buildFormula(c.entry), { formatter })).toBe(expected.get("asciimath"));
  });
  it("renders latex byte-identical to the oracle", () => {
    expect(toLatex(buildFormula(c.entry), { formatter })).toBe(expected.get("latex"));
  });
  it("renders mathml byte-identical to the oracle", () => {
    expect(toMathml(buildFormula(c.entry), { formatter })).toBe(expected.get("mathml"));
  });
  it("renders unicodemath byte-identical to the oracle", () => {
    expect(toUnicodemath(buildFormula(c.entry), { formatter })).toBe(expected.get("unicodemath"));
  });
  it("renders html byte-identical to the oracle", () => {
    const html = expected.get("html");
    const rendered = toHtml(buildFormula(c.entry), { formatter });
    // The two oldest cases predate the html target and carry no html
    // expectation: they still assert the render completes with a string.
    if (html === undefined) expect(typeof rendered).toBe("string");
    else expect(rendered).toBe(html);
  });
  it("still refuses omml — another lane's", () => {
    expect(() => toOmml(buildFormula(c.entry), { formatter } as never)).toThrow(RenderError);
  });
});

describe("string_format cases (B2-O's) are refused by name", () => {
  it.each(ALL.filter((c) => c.stringFormat !== null).map((c) => [c.entry.id, c] as const))(
    "%s",
    (_id, c) => {
      expect(() => toAsciimath(buildFormula(c.entry), { formatter: c.formatter })).toThrow(
        /formatter\.stringFormat/,
      );
    },
  );
});

/**
 * Measured directly on the pinned oracle (`~/ruby_gems/plurimath-oracle` at
 * 00c52783, v0.11.6), one call per row:
 *
 *   BUNDLE_GEMFILE=~/ruby_gems/plurimath-oracle/Gemfile mise x -- bundle exec ruby -e '
 *     require "plurimath"
 *     puts Plurimath::Formatter::Standard.new(locale: "en", options: OPTIONS, precision: PRECISION)
 *                                        .localized_number(VALUE)'
 *
 * Many of the digit_count, significant and number_sign inputs are taken from
 * `spec/plurimath/number_formatter_spec.rb` (its `digit_count`, `significant`
 * and `number_sign` contexts), rerun through `Formatter::Standard` — the class
 * the `formatter:` option mirrors — whose defaults (fraction grouping on)
 * differ from the base `NumberFormatter` those examples use, so the expected
 * strings are what Standard answered, not the spec's. Each row is
 * `[value, formatter, expected]`.
 */
const MEASURED: ReadonlyArray<readonly [string, FormatterOptions, string]> = [
  [
    "283.180",
    {
      options: {
        decimal: ",",
        groupDigits: 3,
        group: "'",
        fractionGroupDigits: 3,
        fractionGroup: " ",
        digitCount: 6,
      },
    },
    "283,180",
  ],
  [
    "283.180000000000",
    {
      options: {
        decimal: ",",
        groupDigits: 3,
        group: "'",
        fractionGroupDigits: 3,
        fractionGroup: " ",
        digitCount: 6,
      },
    },
    "283,180",
  ],
  ["14236.39239", { options: { digitCount: 6, groupDigits: 3 } }, "14,236.4"],
  ["999.9", { options: { digitCount: 3, groupDigits: 3, group: ",", decimal: "." } }, "1,000"],
  ["8999.569", { options: { digitCount: 6 } }, "8,999.57"],
  ["8999.569", { options: { digitCount: 4 } }, "9,000"],
  ["99999.999", { options: { digitCount: 3 } }, "100,000"],
  ["12345.123", { options: { digitCount: 3 } }, "12,345"],
  ["12345.5", { options: { digitCount: 5 } }, "12,346"],
  ["12345.4", { options: { digitCount: 5 } }, "12,345"],
  ["-999.7", { options: { digitCount: 2 } }, "-1,000"],
  ["0.001", { options: { digitCount: 3 } }, "0.00"],
  ["1234", { options: { digitCount: 6 } }, "1,234"],
  ["9.99", { options: { digitCount: 2 } }, "10"],
  ["99.99", { options: { digitCount: 3 } }, "100"],
  ["3.5", { precision: 4, options: { digitCount: 6 } }, "3.500'00"],
  ["0.001", { options: { significant: 3 } }, "0.001"],
  ["112", { options: { significant: 2 } }, "110"],
  ["1999", { options: { significant: 2 } }, "2,000"],
  ["1999.9", { options: { significant: 4 } }, "2,000"],
  ["112436", { options: { significant: 5 } }, "112,440"],
  ["1234567", { options: { significant: 5 } }, "1,234,600"],
  ["0.1999", { options: { significant: 3 } }, "0.200"],
  ["12.5", { options: { significant: 2 } }, "13"],
  ["0.0005", { options: { significant: 1 } }, "0.000'5"],
  ["9.99", { options: { significant: 2 } }, "10"],
  ["0", { options: { significant: 3 } }, "0"],
  ["0.000", { options: { significant: 2 } }, "0.000"],
  ["100", { options: { significant: 5 } }, "100"],
  ["0.5", { options: { significant: 1 } }, "0.5"],
  ["99.5", { options: { significant: 2 } }, "100"],
  ["327428.7432878432992", { options: { significant: 9 } }, "327,428.743"],
  ["1.23456", { options: { significant: 3 } }, "1.23"],
  ["0.99", { options: { significant: 1 } }, "1"],
  ["1234.5678", { precision: 1 }, "1,234.5"],
  ["1234.5678", { options: { precision: 3 } }, "1,234.567"],
  ["1234.5678", { precision: 1, options: { precision: 3 } }, "1,234.5"],
  ["0.999", { precision: 2 }, "0.99"],
  ["-3.999", { precision: 1 }, "-3.9"],
  ["5", { precision: 3 }, "5.000"],
  ["5.25", { options: { precision: 0 } }, "5"],
  ["12", { precision: 0 }, "12"],
  ["1.9999", { options: { precision: 2, significant: 3 } }, "1.99"],
  ["1.5e10", {}, "15,000,000,000"],
  ["1e-3", {}, "0.001"],
  ["1E5", {}, "100,000"],
  ["1.5e+2", {}, "150"],
  ["-0", {}, "-0"],
  ["+5", {}, "5"],
  ["-5", {}, "-5"],
  [".5", {}, "0.5"],
  ["5.", {}, "5"],
  ["007", {}, "7"],
  ["0.0", {}, "0.0"],
  ["123.4e-2", {}, "1.234"],
  ["1e5", { precision: 2 }, "100,000.00"],
  ["32", { options: { paddingDigits: 6, group: " ", groupDigits: 3 } }, "000 032"],
  ["32", { options: { padding: " ", paddingDigits: 6, groupDigits: 10 } }, "    32"],
  ["32123", { options: { paddingGroupDigits: 4, groupDigits: 10 } }, "00032123"],
  ["32123", { options: { paddingGroupDigits: 4, group: " ", groupDigits: 3 } }, "00 032 123"],
  ["32", { options: { padding: "ab", paddingDigits: 4 } }, "a,a32"],
  ["32", { options: { padding: "", paddingDigits: 4 } }, "0,032"],
  ["123456", { options: { paddingDigits: 3 } }, "123,456"],
  ["7", { options: { paddingGroupDigits: 3, groupDigits: 0 } }, "007"],
  ["1234.5", { options: { paddingDigits: 8, padding: "*" } }, "**,**1,234.5"],
  ["5", { options: { paddingDigits: 3, numberSign: "plus" } }, "+005"],
  ["14236.39239", { options: { numberSign: "plus" } }, "+14,236.392'39"],
  ["-14236.39239", { options: { numberSign: "plus" } }, "-14,236.392'39"],
  ["0", { options: { numberSign: "plus" } }, "+0"],
  ["-0", { options: { numberSign: "plus" } }, "-0"],
  ["5", { options: { numberSign: "minus" } }, "5"],
  ["5", { precision: 0, options: { numberSign: "plus" } }, "+5"],
];

describe("measured on the oracle", () => {
  it.each(MEASURED)("%s with %j", (value, formatter, expected) => {
    const format = resolveNumberFormat(formatter, "asciimath");
    if (format === null) throw new Error("expected an active formatter");
    expect(applyNumberFormat(value, format)).toBe(expected);
  });
});

describe("option validation", () => {
  const refuses = (formatter: FormatterOptions, pattern: RegExp) => {
    expect(() => resolveNumberFormat(formatter, "asciimath")).toThrow(RenderError);
    expect(() => resolveNumberFormat(formatter, "asciimath")).toThrow(pattern);
  };

  it("refuses a negative or non-integer precision, keyword or option", () => {
    refuses({ precision: -1 }, /formatter\.precision/);
    refuses({ precision: 1.5 }, /formatter\.precision/);
    refuses({ options: { precision: -2 } }, /formatter\.precision/);
  });

  it("refuses a negative or non-integer count", () => {
    for (const key of ["significant", "digitCount", "paddingDigits", "paddingGroupDigits"]) {
      refuses({ options: { [key]: -1 } }, new RegExp(key));
      refuses({ options: { [key]: 1.5 } }, new RegExp(key));
      refuses({ options: { [key]: "3" } } as never, new RegExp(key));
    }
  });

  it("refuses paddingDigits and paddingGroupDigits together, by key presence", () => {
    // The gem raises ConfigurationError (conflicting_formatter_options) when both keys exist.
    refuses({ options: { paddingDigits: 3, paddingGroupDigits: 2 } }, /conflict/);
    refuses({ options: { paddingDigits: 0, paddingGroupDigits: 0 } }, /conflict/);
  });

  it("refuses a non-string padding and number sign", () => {
    refuses({ options: { padding: 0 } } as never, /padding/);
    refuses({ options: { numberSign: true } } as never, /numberSign/);
  });
});
