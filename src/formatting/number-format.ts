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
 * Since B2's numeric-pipeline slice this also covers `precision` (keyword and
 * `options.precision`), `significant`, `digitCount`, `padding`/`paddingDigits`/
 * `paddingGroupDigits` and `numberSign` — the digit model is `numbers/`
 * (`Source` -> `NumberParts` -> `FormattedNumber`, `numbers/number-renderer.ts`),
 * and `applyNumberFormat` below is its text rendering.
 *
 * Notation (`notation`: `e`/`scientific`/`engineering`, with `e`, `times` and
 * `exponentSign`) is `numbers/notation.ts`'s: the gem branches to it before
 * the numeric pipeline and localizes the coefficient back through it.
 *
 * Deliberately NOT here, and refused by name rather than silently ignored:
 * base notation (`base`, `basePrefix`, `basePostfix`, `hexCapital`) and
 * `stringFormat` — each is a later lane (TODO.plan/feature-roadmap.md, Chain B), built on the seam
 * `numbers/number-renderer.ts` documents.
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
import { type FormattedNumber, formattedNumberText } from "./numbers/formatted-number";
import {
  type FormattedNotation,
  formattedNotationText,
  isFormattedNotation,
  NOTATIONS,
  type Notation,
  type NotationFormat,
  renderNotation,
} from "./numbers/notation";
import { formatNumber, type NumericOptions } from "./numbers/number-renderer";

/** `Formatter::Standard::DEFAULT_OPTIONS[:group_digits]`. */
const DEFAULT_GROUP_DIGITS = 3;
/** `FormatOptions::DEFAULT_PADDING` (`format_options.rb:13`). */
const DEFAULT_PADDING = "0";
/**
 * `FormatOptions#fraction_group`/`#fraction_group_digits`
 * (`format_options.rb:69-75`) do read with no default of their own —
 * `fraction_group` falls back to `""` (`separator_option` on a missing key),
 * `fraction_group_digits` to `nil` (`integer_option` with no `default:`
 * kwarg) — but by the time a call reaches `FormatOptions`, the gem's public
 * `Formatter::Standard` class (the class this port's `formatter:` shape
 * mirrors) has already filled both in: `Standard::DEFAULT_OPTIONS` sets
 * `fraction_group_digits: 3` and `fraction_group: "'"`, applied by
 * `Standard#set_default_options` unless the caller's own options hash
 * already has the key. So fraction-side grouping IS on by default — live
 * oracle check: `Formatter::Standard.new.format`-equivalent call on
 * `"1.123456"` answers `"1.123'456"`, not `"1.123456"`. This is a real
 * default, unlike `Standard`'s decimal/group locale-defaulting above, which
 * this port deliberately does NOT reproduce — there is no locale-layering
 * question here for grouping defaults to override, so the port matches
 * `Standard::DEFAULT_OPTIONS` directly.
 */
const DEFAULT_FRACTION_GROUP_MARKER = "'";
const DEFAULT_FRACTION_GROUP_DIGITS = 3;

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
 * The `formatter.options` fields the numeric pipeline implements — `Formatter::
 * Standard::DEFAULT_OPTIONS`' decimal/group/group_digits triple, the
 * fraction-side grouping pair, and the digit-shaping keys `precision`,
 * `significant`, `digit_count`, `padding`, `padding_digits`,
 * `padding_group_digits` and `number_sign`, and the notation keys `notation`,
 * `e`, `times` and `exponent_sign`. The base keys (`base`, `base_prefix`,
 * `base_postfix`, `hex_capital`) belong to a later lane and are refused as
 * unknown keys by `assertKnownOptions` below, never silently accepted and
 * ignored.
 *
 * `times: null` is the gem's explicit `nil` (`FormatOptions#times` then falls
 * back to `"\u00d7"`), where an absent or `undefined` key takes `Standard`'s
 * `"x"`. `e: null` and `exponentSign: null` fall back to the same values an
 * absent key gives.
 */
export interface FormatterSymbolOptions {
  readonly decimal?: string;
  readonly group?: string;
  readonly groupDigits?: number;
  readonly fractionGroup?: string;
  readonly fractionGroupDigits?: number;
  readonly precision?: number | null;
  readonly significant?: number;
  readonly digitCount?: number;
  readonly padding?: string | null;
  readonly paddingDigits?: number;
  readonly paddingGroupDigits?: number;
  readonly numberSign?: string | null;
  readonly notation?: string | null;
  readonly e?: string | null;
  readonly times?: string | null;
  readonly exponentSign?: string | null;
}

/**
 * The `formatter:` render option — `Formatter::Standard.new(locale:,
 * string_format:, options:, precision:)`'s keyword shape, ported field for
 * field (TODO.plan/open-decisions.md, "plain options object", not a class
 * instance). `stringFormat` is declared here — the gem really does take it —
 * so a caller passing one gets a named refusal (`resolveNumberFormat` below)
 * rather than "unknown option".
 */
export interface FormatterOptions {
  readonly locale?: string | null;
  readonly options?: FormatterSymbolOptions | null;
  readonly precision?: number | null;
  readonly stringFormat?: null;
}

/** What a text renderer's `Number` kind file needs to render one value. */
export interface NumberFormat extends NumericOptions, NotationFormat {
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
  "precision",
  "significant",
  "digitCount",
  "padding",
  "paddingDigits",
  "paddingGroupDigits",
  "numberSign",
  "notation",
  "e",
  "times",
  "exponentSign",
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
 * `FormatOptions#integer_option` (`format_options.rb:174`): a count must be a
 * non-negative integer. Absent or `null` is the default; the gem's
 * numeric-String/Symbol coercion is not ported (this port's options are
 * typed numbers), so a string is refused rather than coerced.
 */
function countOption(value: unknown, key: string, fallback: number, format: string): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new RenderError(
      `formatter.options.${key}: ${JSON.stringify(value)} is not a non-negative integer`,
      format,
      "unknown",
    );
  }
  return value;
}

/**
 * `FormatOptions#padding` (`format_options.rb:113`): the first character of
 * the given string; absent, `null` and `""` all mean `"0"`.
 */
function paddingOption(value: unknown, format: string): string {
  if (value === undefined || value === null) return DEFAULT_PADDING;
  if (typeof value !== "string") {
    throw new RenderError(
      `formatter.options.padding: ${JSON.stringify(value)} is not a string`,
      format,
      "unknown",
    );
  }
  return value === "" ? DEFAULT_PADDING : ([...value][0] as string);
}

/**
 * `FormatOptions#number_sign` (`format_options.rb:109`, `symbol_option`): a
 * String or Symbol, or absent. Any string is accepted, as the gem does — only
 * `"plus"` changes the output (`FormattedNumber#sign_text`).
 */
function numberSignOption(value: unknown, format: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new RenderError(
      `formatter.options.numberSign: ${JSON.stringify(value)} is not a string`,
      format,
      "unknown",
    );
  }
  return value;
}

/**
 * `FormatOptions#symbol_option` (`format_options.rb:213`): a String or Symbol,
 * or absent; anything else raises `invalid_formatter_option`. `null` is the
 * gem's nil and reads as absent.
 */
function symbolOption(value: unknown, key: string, format: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    throw new RenderError(
      `formatter.options.${key}: ${JSON.stringify(value)} is not a string`,
      format,
      "unknown",
    );
  }
  return value;
}

/**
 * `FormatOptions#notation_supported?`: only the three notation names switch
 * the render path. Any other string (`"basic"`, a typo, a different case)
 * renders as a plain number, as the gem does — measured on the oracle,
 * `notation: "foo"` and `"Scientific"` both answer `"1,234.5"` for `1234.5`.
 */
function notationOption(value: unknown, format: string): Notation | null {
  const notation = symbolOption(value, "notation", format);
  return (NOTATIONS as readonly string[]).includes(notation as string)
    ? (notation as Notation)
    : null;
}

/**
 * `FormatOptions#times` (`format_options.rb:25`): `Standard` fills `"x"` into
 * an absent key, but an explicitly `nil` one reaches `FormatOptions`, which
 * defaults it to `"\u00d7"`.
 */
function timesOption(value: unknown, format: string): string {
  if (value === undefined) return "x";
  return symbolOption(value, "times", format) ?? "\u00d7";
}

/**
 * `FormatOptions#resolve_precision` (`format_options.rb:146`): the keyword
 * wins over `options[:precision]`, and either must be a non-negative integer.
 * `null` is the gem's nil — the resolver then infers it from the value.
 */
function explicitPrecision(keyword: unknown, option: unknown, format: string): number | null {
  const value = keyword === undefined || keyword === null ? option : keyword;
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new RenderError(
      `formatter.precision: ${JSON.stringify(value)} is not a non-negative integer`,
      format,
      "unknown",
    );
  }
  return value;
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
  // `FormatOptions#validate_padding_options!` (`format_options.rb:236`) is
  // keyed on the KEY being present, not on its value.
  if (
    options !== null &&
    options !== undefined &&
    Object.hasOwn(options, "paddingDigits") &&
    Object.hasOwn(options, "paddingGroupDigits")
  ) {
    throw new RenderError(
      "formatter.options: paddingDigits and paddingGroupDigits conflict — the gem raises " +
        "ConfigurationError (conflicting_formatter_options) when both keys are present",
      format,
      "unknown",
    );
  }

  return {
    decimal: options?.decimal ?? decimalDefault,
    group: options?.group ?? groupDefault,
    groupDigits: countOption(options?.groupDigits, "groupDigits", DEFAULT_GROUP_DIGITS, format),
    fractionGroup: options?.fractionGroup ?? DEFAULT_FRACTION_GROUP_MARKER,
    fractionGroupDigits: countOption(
      options?.fractionGroupDigits,
      "fractionGroupDigits",
      DEFAULT_FRACTION_GROUP_DIGITS,
      format,
    ),
    precision: explicitPrecision(formatter.precision, options?.precision, format),
    significant: countOption(options?.significant, "significant", 0, format),
    digitCount: countOption(options?.digitCount, "digitCount", 0, format),
    padding: paddingOption(options?.padding, format),
    paddingDigits: countOption(options?.paddingDigits, "paddingDigits", 0, format),
    paddingGroupDigits: countOption(options?.paddingGroupDigits, "paddingGroupDigits", 0, format),
    numberSign: numberSignOption(options?.numberSign, format),
    notation: notationOption(options?.notation, format),
    exponentSeparator: symbolOption(options?.e, "e", format) ?? "e",
    times: timesOption(options?.times, format),
    exponentSign: symbolOption(options?.exponentSign, "exponentSign", format),
  };
}

/**
 * `Formatter::Numbers::Source::NUMERIC_PATTERN` (`source.rb:18`), verbatim —
 * signed, optionally-fractional, optionally-exponential digit strings. This is
 * what a `Number` node's value must match to be formatted at all
 * (`Source#validate_numeric!`'s test); a value that fails it is refused below.
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
 * Call once a `context.numberFormat` is active and `isGemNumericValue` has
 * already said no: refuses exactly what `Source#validate_numeric!` does,
 * matching the gem's `Plurimath::Errors::InvalidNumber` refusal
 * (`[plurimath] Invalid number ... for number formatting`) with this port's
 * own `RenderError` boundary (`core/render-options.ts`'s convention — the
 * port's own error, never the gem's wording). A value that passes is
 * formatted by `applyNumberFormat`; this returns for it.
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
 * `NumberFormatter#formatted_number`: the structured result — a
 * `FormattedNotation` when `notation` names a supported one (the gem branches
 * before the numeric pipeline), else the pipeline's `FormattedNumber`. MathML
 * lays the two out structurally; the text formats read `applyNumberFormat`.
 * `value` must satisfy `isGemNumericValue`.
 */
export function formatNumberValue(
  value: string,
  format: NumberFormat,
): FormattedNumber | FormattedNotation {
  if (format.notation !== null) return renderNotation(value, format.notation, format);
  return formatNumber(value, format);
}

/**
 * `Formatter::Numbers::TextRenderer.render` for a number with no base
 * notation: the structured result's `to_s`. For a plain number that is the
 * sign, grouped integer digits, decimal marker and grouped fraction digits;
 * for a notation, `FormattedNotation#to_s`. `value` must satisfy
 * `isGemNumericValue`.
 */
export function applyNumberFormat(value: string, format: NumberFormat): string {
  const result = formatNumberValue(value, format);
  return isFormattedNotation(result) ? formattedNotationText(result) : formattedNumberText(result);
}
