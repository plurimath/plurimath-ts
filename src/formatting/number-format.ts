/**
 * B2's first two slices of the per-call `formatter:` render option
 * (TODO.plan/feature-roadmap.md, "Number formatting"; TODO.plan/
 * open-decisions.md, "Number-formatter API shape"): `Formatter::Standard`'s
 * `DEFAULT_OPTIONS` and `SymbolResolver`'s locale-symbol substitution, cut
 * down to what these slices measure — the decimal marker, the group marker
 * and integer-side digit grouping (`Integer#format_groups` with the default
 * padding, which is a no-op), plus fraction-side grouping
 * (`Fraction#format_groups`/`#change_format`, `fraction_group`/
 * `fraction_group_digits`).
 *
 * Deliberately NOT here, and refused by name rather than silently ignored:
 * precision, significant digits, notation (`e`, `scientific`, `engineering`),
 * base notation, sign handling, and padding beyond the default. None of the
 * gem sources for those (`precision_resolver.rb`, `significant.rb`,
 * `notation_renderer.rb`, `base_notation.rb`, `sign_renderer.rb`,
 * `integer.rb`'s padding branch) has been read for this change —
 * TODO.plan/feature-roadmap.md's build order puts each on a later B2 slice.
 *
 * **Locale coverage.** Every locale `formatting/locales.ts` knows — all 96 of
 * `Formatter::SupportedLocales::LOCALES` — is accepted here too, sourcing its
 * decimal AND group defaults from `./generated/locale-decimals.ts` and
 * `./generated/locale-groups.ts` (`scripts/generate-formatting-data.rb`, both
 * live-verified against the oracle). `formatter.options.decimal`/`group`
 * still override the locale's own defaults when given, matching how the gem
 * layers explicit symbols over a locale's `SupportedLocales` entry
 * (`Formatter::Numbers::SymbolResolver#resolve`:
 * `locale_symbols.merge(explicit_symbols)`).
 *
 * That layering is `SymbolResolver`'s, deliberately NOT `Formatter::
 * Standard`'s own — a real, measured divergence worth recording. Constructing
 * `Formatter::Standard.new(locale: "de")` on the pinned oracle and rendering
 * `1234567` answers `"1,234,567"`, the "en" symbols, not the German
 * `"1.234.567"`: `Standard#set_default_options` fills every `DEFAULT_OPTIONS`
 * key — including `:decimal` and `:group` — onto the options hash before
 * `SymbolResolver#resolve` ever merges the locale's entry in, so those two
 * keys are never actually absent by the time the locale's own symbols would
 * have applied. Through the gem's own public `Formatter::Standard` class,
 * `locale:` is therefore inert for `decimal`/`group` in the current oracle
 * version (v0.11.6, `00c52783`) — only the base `Plurimath::NumberFormatter`
 * class (used with an empty `localizer_symbols:` hash) actually renders with
 * a locale's own symbols, which is the live call `scripts/
 * generate-formatting-data.rb` verifies the generated `group` column against.
 * This port implements the layering `SymbolResolver` was written to provide
 * — locale defaults, explicit options win — rather than reproducing
 * `Standard`'s own defaulting, since the alternative would make this widening
 * a no-op for every locale but "en" and contradicts what `SupportedLocales`'
 * `group` column is for. Worth a maintainer's attention as a possible gem
 * defect, not a designed API.
 */

import { RenderError } from "../core/errors";
import { assertKnownOptions } from "../core/render-options";
import { DEFAULT_GROUP_MARKER, LOCALE_GROUP_MARKERS } from "./generated/locale-groups";
import {
  DEFAULT_DECIMAL_MARKER,
  decimalMarkerFor,
  isSupportedLocale,
  SUPPORTED_LOCALES,
} from "./locales";

/** `Formatter::Standard::DEFAULT_OPTIONS[:group_digits]`. */
const DEFAULT_GROUP_DIGITS = 3;
/**
 * `FormatOptions#fraction_group`/`#fraction_group_digits`
 * (`format_options.rb:69-75`) have no `DEFAULT_*` constant unlike their
 * integer-side counterparts: `fraction_group` falls back to `""`
 * (`separator_option(:fraction_group).to_s` on a missing key), and
 * `fraction_group_digits` falls back to `nil` (`integer_option` called with
 * no `default:` kwarg). `Fraction#format_groups`'s `group.to_i.zero?` check
 * (`fraction.rb:55`) then reads that absent digit count as zero and skips
 * grouping — so, unlike the integer side, no grouping happens unless the
 * caller asks for it. `0` is this port's own sentinel for "off", matching
 * `groupFractionDigits`'s `size <= 0` no-op branch below.
 */
const DEFAULT_FRACTION_GROUP_MARKER = "";
const DEFAULT_FRACTION_GROUP_DIGITS = 0;

/** Locale key -> group marker, mirroring `formatting/locales.ts`'s `MARKER_BY_LOCALE`. */
const GROUP_MARKER_BY_LOCALE: ReadonlyMap<string, string> = new Map(LOCALE_GROUP_MARKERS);

/**
 * Ruby: `Formatter::SupportedLocales.symbols_for(locale).fetch(:group)`, cut
 * down to the one column this slice reads (`locales.ts`'s `decimalMarkerFor`
 * is the `decimal` counterpart). `locale` is assumed already validated by the
 * caller — `resolveNumberFormat` below checks `isSupportedLocale` before
 * this ever runs — so an unrecognised key is a caller bug, not a case this
 * falls back for.
 */
function groupMarkerFor(locale: string): string {
  return GROUP_MARKER_BY_LOCALE.get(locale) ?? DEFAULT_GROUP_MARKER;
}

/**
 * The `formatter.options` fields this slice implements — `Formatter::
 * Standard::DEFAULT_OPTIONS`' decimal/group/group_digits triple, plus
 * `fraction_group`/`fraction_group_digits`. Every other key that hash
 * accepts (`padding`, `significant`, `notation`, `precision`, `digit_count`,
 * `times`, `e`, `number_sign`, `exponent_sign`) is a later slice and is
 * refused as an unknown key by `assertKnownOptions` below, never silently
 * accepted and ignored.
 */
export interface FormatterSymbolOptions {
  readonly decimal?: string;
  readonly group?: string;
  readonly groupDigits?: number;
  readonly fractionGroup?: string;
  readonly fractionGroupDigits?: number;
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
  readonly fractionGroup: string;
  readonly fractionGroupDigits: number;
}

const ACCEPTED_FORMATTER_KEYS: readonly string[] = [
  "locale",
  "options",
  "precision",
  "stringFormat",
];
const ACCEPTED_SYMBOL_KEYS: readonly string[] = [
  "decimal",
  "group",
  "groupDigits",
  "fractionGroup",
  "fractionGroupDigits",
];

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
  let decimalDefault = DEFAULT_DECIMAL_MARKER;
  let groupDefault = DEFAULT_GROUP_MARKER;
  if (locale !== null && locale !== undefined) {
    if (!isSupportedLocale(locale)) {
      throw new RenderError(
        `formatter.locale: ${JSON.stringify(locale)} is not one of the ${
          SUPPORTED_LOCALES.length
        } locales the oracle's Formatter::SupportedLocales table holds`,
        format,
        "unknown",
      );
    }
    decimalDefault = decimalMarkerFor(locale);
    groupDefault = groupMarkerFor(locale);
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
  const fractionGroupDigits = options?.fractionGroupDigits ?? DEFAULT_FRACTION_GROUP_DIGITS;
  if (!Number.isInteger(fractionGroupDigits) || fractionGroupDigits < 0) {
    throw new RenderError(
      `formatter.options.fractionGroupDigits: ${JSON.stringify(fractionGroupDigits)} is not a ` +
        "non-negative integer",
      format,
      "unknown",
    );
  }

  return {
    decimal: options?.decimal ?? decimalDefault,
    group: options?.group ?? groupDefault,
    groupDigits,
    fractionGroup: options?.fractionGroup ?? DEFAULT_FRACTION_GROUP_MARKER,
    fractionGroupDigits,
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
 * `Formatter::Numbers::Source::NUMERIC_PATTERN` (`source.rb:18`), verbatim —
 * signed, optionally-fractional, optionally-exponential digit strings. Wider
 * than `PLAIN_NUMBER_PATTERN` above (which is what this slice actually
 * formats): a value can match this and still fall through to the raw-value
 * path below, for shapes (negative sign, scientific notation) this slice does
 * not yet group or substitute into. What this pattern draws the line on is
 * `Source#validate_numeric!`'s OTHER branch — a value that fails it entirely.
 */
const GEM_NUMERIC_PATTERN = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * `Formatter::Numbers::Source#validate_numeric!` (`source.rb:93-98`): a value
 * given to an active formatter must be `Numeric` or a `String` matching
 * `NUMERIC_PATTERN` (base-10 only — this port's `Number` slot never carries a
 * base other than 10, so the gem's `non_decimal_base?` escape hatch does not
 * apply here); anything else raises `Plurimath::Errors::InvalidNumber`. This
 * port's `Number` slot is always `string | null` (never a JS number), so the
 * `Numeric` half of the gem's check has no counterpart to test — a `null`
 * value renders as `""` before reaching the gem's formatter (`number.rb:85`,
 * `nil.to_s`), which `NUMERIC_PATTERN` also refuses, so `null` refuses too.
 */
export function isGemNumericValue(value: unknown): value is string {
  return typeof value === "string" && GEM_NUMERIC_PATTERN.test(value);
}

/**
 * Call once a `context.numberFormat` is active and `isPlainFormattableNumber`
 * has already said no: refuses exactly what `Source#validate_numeric!` does,
 * matching the gem's `Plurimath::Errors::InvalidNumber` refusal
 * (`[plurimath] Invalid number ... for number formatting`) with this port's
 * own `RenderError` boundary (`core/render-options.ts`'s convention — the
 * port's own error, never the gem's wording).
 *
 * A value that passes is not necessarily formatted by this slice — a
 * negative number or scientific notation is gem-valid but still out of this
 * slice's scope (module doc above) and falls through to the raw-value path,
 * unformatted, exactly as before this change.
 */
export function refuseNonNumericUnderFormatter(value: unknown, format: string, kind: string): void {
  if (isGemNumericValue(value)) return;
  throw new RenderError(
    `number.value: ${JSON.stringify(value)} is not a numeric string under an active ` +
      "formatter — Formatter::Numbers::Source#validate_numeric! (source.rb) raises " +
      "Plurimath::Errors::InvalidNumber for a value that is not Numeric/String, or a " +
      "String failing NUMERIC_PATTERN",
    format,
    kind,
  );
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
 * `Fraction#change_format`'s grouping loop (`fraction.rb:62-69`) — chop
 * `size` digits off the LEFT, repeat, join left-to-right with `separator`.
 * The direction is the opposite of `groupIntegerDigits`: the gem's integer
 * side groups from the least-significant (rightmost) digit outward, so any
 * short leftover chunk lands at the front (`"123456"` grouped by 3 is
 * `"123,456"` — nothing short there, but `"1234567"` by 3 is `"1,234,567"`,
 * the short chunk first); the fraction side groups from the
 * most-significant (leftmost, i.e. nearest the decimal point) digit
 * outward, so any short leftover chunk lands at the end (measured on the
 * pinned oracle, `00c52783`, run directly against a live `Fraction`
 * instance: `format_groups("123456", 4)` with `fraction_group: "-"` answers
 * `"1234-56"`, the short chunk last). This slice's one testsuite oracle case
 * (`number-formatter-fraction-side-grouping`) does not itself exercise an
 * uneven split — 9 digits split by 3 leaves no remainder — so the
 * uneven-split direction is confirmed by the ad hoc gem run above and
 * `fraction_spec.rb`'s `format_groups` examples, not by that case's
 * byte-diffed port output.
 */
function groupFractionDigits(digits: string, separator: string, size: number): string {
  if (size <= 0 || digits.length <= size) return digits;
  const tokens: string[] = [];
  let remaining = digits;
  while (remaining.length > 0) {
    tokens.push(remaining.slice(0, size));
    remaining = remaining.slice(size);
  }
  return tokens.join(separator);
}

/**
 * `Formatter::Numbers::TextRenderer.render` for the plain (non-base-notation)
 * path this slice covers: swap the decimal marker, group the integer
 * digits, and group the fraction digits — each side with its own separator,
 * digit count, and direction (`groupIntegerDigits` groups right-to-left,
 * `groupFractionDigits` left-to-right; see that function's header).
 */
export function applyNumberFormat(value: string, format: NumberFormat): string {
  const dot = value.indexOf(".");
  if (dot === -1) return groupIntegerDigits(value, format.group, format.groupDigits);
  const integerPart = groupIntegerDigits(value.slice(0, dot), format.group, format.groupDigits);
  const fractionPart = groupFractionDigits(
    value.slice(dot + 1),
    format.fractionGroup,
    format.fractionGroupDigits,
  );
  return `${integerPart}${format.decimal}${fractionPart}`;
}
