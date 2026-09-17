/**
 * B2's first slice of the per-call `formatter:` render option
 * (TODO.plan/feature-roadmap.md, "Number formatting"; TODO.plan/
 * open-decisions.md, "Number-formatter API shape"): `Formatter::Standard`'s
 * `DEFAULT_OPTIONS` and `SymbolResolver`'s locale-symbol substitution, cut
 * down to what this slice measures — the decimal marker, the group marker,
 * and integer-side digit grouping (`Integer#format_groups` with the default
 * padding, which is a no-op).
 *
 * Deliberately NOT here, and refused by name rather than silently ignored:
 * precision, significant digits, notation (`e`, `scientific`, `engineering`),
 * base notation, sign handling, fraction-side grouping (`fraction_group`,
 * `fraction_group_digits`), and padding beyond the default. None of the gem
 * sources for those (`precision_resolver.rb`, `significant.rb`,
 * `notation_renderer.rb`, `base_notation.rb`, `sign_renderer.rb`,
 * `fraction.rb`, `integer.rb`'s padding branch) has been read for this
 * change — TODO.plan/feature-roadmap.md's build order puts each on a later
 * B2 slice.
 *
 * Locale coverage is narrow for the same reason `formatting/locales.ts`'s
 * decimal table is: that module's header records that the gem's `group`
 * column is "deliberately not emitted" because nothing at parse time reads
 * it. Rendering now does, and generating that table (`scripts/
 * generate-formatting-data.rb`) is its own slice of work this change does not
 * do. Only `"en"` — and no locale at all, which the gem's own
 * `NumberFormatter#supported_locale` also reads as `"en"` — is supported;
 * any other locale is refused by name.
 */

import { RenderError } from "../core/errors";
import { assertKnownOptions } from "../core/render-options";
import { DEFAULT_DECIMAL_MARKER } from "./locales";

/** `Formatter::Standard::DEFAULT_OPTIONS[:group]`. */
const DEFAULT_GROUP_MARKER = ",";
/** `Formatter::Standard::DEFAULT_OPTIONS[:group_digits]`. */
const DEFAULT_GROUP_DIGITS = 3;

/**
 * The `formatter.options` fields this slice implements — `Formatter::
 * Standard::DEFAULT_OPTIONS`' decimal/group/group_digits triple. Every other
 * key that hash accepts (`fraction_group`, `fraction_group_digits`,
 * `padding`, `significant`, `notation`, `precision`, `digit_count`, `times`,
 * `e`, `number_sign`, `exponent_sign`) is a later slice and is refused as an
 * unknown key by `assertKnownOptions` below, never silently accepted and
 * ignored.
 */
export interface FormatterSymbolOptions {
  readonly decimal?: string;
  readonly group?: string;
  readonly groupDigits?: number;
}

/**
 * The `formatter:` render option — `Formatter::Standard.new(locale:,
 * string_format:, options:, precision:)`'s keyword shape, ported field for
 * field (TODO.plan/open-decisions.md, "plain options object", not a class
 * instance). `precision` and `stringFormat` are declared here — the gem
 * really does take them — so a caller passing one gets a named refusal
 * (`resolveNumberFormat` below) rather than "unknown option".
 */
export interface FormatterOptions {
  readonly locale?: string | null;
  readonly options?: FormatterSymbolOptions | null;
  readonly precision?: null;
  readonly stringFormat?: null;
}

/** What a text renderer's `Number` kind file needs to render one value. */
export interface NumberFormat {
  readonly decimal: string;
  readonly group: string;
  readonly groupDigits: number;
}

const ACCEPTED_FORMATTER_KEYS: readonly string[] = [
  "locale",
  "options",
  "precision",
  "stringFormat",
];
const ACCEPTED_SYMBOL_KEYS: readonly string[] = ["decimal", "group", "groupDigits"];

/** `undefined`/`null` mean "the gem's default", present-and-anything-else is refused. */
function refuseUnlessAbsent(value: unknown, key: string, format: string): void {
  if (value === null || value === undefined) return;
  throw new RenderError(
    `formatter.${key}: not implemented by this slice (TODO.plan/feature-roadmap.md, ` +
      "Number formatting) — pass null, undefined, or omit the key",
    format,
    "unknown",
  );
}

/**
 * `Formatter::Standard.new(...)`'s default-symbol half, validated by name at
 * every level — the same "refuse, never silently ignore" contract
 * `assertKnownOptions` gives every other renderer option
 * (`core/render-options.ts`). `formatter` absent or `null` means no
 * formatter at all: a node renders its raw value, exactly as the whole
 * pinned corpus was generated (ARCHITECTURE.md §3).
 */
export function resolveNumberFormat(
  formatter: FormatterOptions | null | undefined,
  format: string,
): NumberFormat | null {
  if (formatter === null || formatter === undefined) return null;
  assertKnownOptions(formatter, ACCEPTED_FORMATTER_KEYS, format);
  refuseUnlessAbsent(formatter.precision, "precision", format);
  refuseUnlessAbsent(formatter.stringFormat, "stringFormat", format);

  const locale = formatter.locale;
  if (locale !== null && locale !== undefined && locale !== "en") {
    throw new RenderError(
      `formatter.locale: ${JSON.stringify(locale)} is not implemented by this slice — only ` +
        '"en" (and no locale at all, which the gem also reads as "en") has a group-marker ' +
        "table; formatting/locales.ts's decimal table has no group column yet " +
        "(TODO.plan/feature-roadmap.md, Number formatting)",
      format,
      "unknown",
    );
  }

  assertKnownOptions(formatter.options, ACCEPTED_SYMBOL_KEYS, format);
  const options = formatter.options;
  const groupDigits = options?.groupDigits ?? DEFAULT_GROUP_DIGITS;
  if (!Number.isInteger(groupDigits) || groupDigits < 0) {
    throw new RenderError(
      `formatter.options.groupDigits: ${JSON.stringify(groupDigits)} is not a non-negative ` +
        "integer",
      format,
      "unknown",
    );
  }

  return {
    decimal: options?.decimal ?? DEFAULT_DECIMAL_MARKER,
    group: options?.group ?? DEFAULT_GROUP_MARKER,
    groupDigits,
  };
}

/**
 * A digit string the grammar can produce for a `Number` node's value: one or
 * more ASCII digits, optionally with a single `.`-separated fraction. Always
 * base 10, and always spelled with `.` — the marker every grammar's `number`
 * rule normalizes to regardless of the parse-time `locale` option
 * (`formatting/locales.ts`), so the render-time `formatter.options.decimal`
 * substitution below always starts from the same character.
 */
const PLAIN_NUMBER_PATTERN = /^\d+(?:\.\d+)?$/;

/** Whether `value` is a shape this slice's grouping/substitution measures. */
export function isPlainFormattableNumber(value: unknown): value is string {
  return typeof value === "string" && PLAIN_NUMBER_PATTERN.test(value);
}

/**
 * `Integer#format_groups`'s grouping loop (`integer.rb:29-36`) — chop `size`
 * digits off the right, repeat, join right-to-left with `separator`. The
 * gem's padding step ahead of it (`pad_integer`) is not reproduced: with
 * `Formatter::Standard::DEFAULT_OPTIONS`' `padding_digits: 0` and no
 * `padding_group_digits` in that hash, `padding_target_width` always answers
 * `string.length`, so padding is a no-op for every case this slice accepts
 * (`formatter.options` admits no padding key at all yet).
 */
function groupIntegerDigits(digits: string, separator: string, size: number): string {
  if (size <= 0 || digits.length <= size) return digits;
  const tokens: string[] = [];
  let remaining = digits;
  while (remaining.length > size) {
    tokens.unshift(remaining.slice(remaining.length - size));
    remaining = remaining.slice(0, remaining.length - size);
  }
  tokens.unshift(remaining);
  return tokens.join(separator);
}

/**
 * `Formatter::Numbers::TextRenderer.render` for the plain (non-base-notation)
 * path this slice covers: swap the decimal marker, and group the integer
 * digits. The fraction digits are NOT regrouped — `Fraction#format_groups`'s
 * `fraction_group`/`fraction_group_digits` are a later slice — so this is
 * only measured against the pinned oracle case for a fraction that already
 * fits inside one group (`number-formatter-de-style-grouping`: 3 fraction
 * digits, under `Formatter::Standard::DEFAULT_OPTIONS`'
 * `fraction_group_digits: 3`, produce no visible fraction separator either
 * way).
 */
export function applyNumberFormat(value: string, format: NumberFormat): string {
  const dot = value.indexOf(".");
  if (dot === -1) return groupIntegerDigits(value, format.group, format.groupDigits);
  const integerPart = groupIntegerDigits(value.slice(0, dot), format.group, format.groupDigits);
  const fractionPart = value.slice(dot + 1);
  return `${integerPart}${format.decimal}${fractionPart}`;
}
