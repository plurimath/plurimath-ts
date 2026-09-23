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
 * Since B2's base slice it also covers base notation (`base` 2/8/10/16,
 * `basePrefix`, `basePostfix`, `hexCapital`) — `numbers/base-notation.ts` —
 * under the numeric pipeline and under notation alike (the coefficient is
 * converted to the base).
 *
 * Deliberately NOT here, and refused by name rather than silently ignored:
 * `stringFormat` — a later lane (TODO.plan/feature-roadmap.md, Chain B),
 * built on the seam `numbers/number-renderer.ts` documents.
 *
 * **Locale.** `formatter.locale` is accepted and INERT, byte-for-byte as in
 * the oracle (v0.11.6, `00c52783`). `Formatter::Standard#set_default_options`
 * fills every `DEFAULT_OPTIONS` key — `decimal: "."` and `group: ","`
 * included — before `SymbolResolver#resolve` merges a locale's
 * `SupportedLocales` entry underneath, so the locale's `decimal`/`group`
 * (the only two keys any of the 96 entries carries) are always overwritten.
 * `Standard.new(locale: "de")` therefore renders `1234567.891` as
 * `"1,234,567.891"`, exactly like `"en"`. `NumberFormatter#supported_locale`
 * falls back to `:en` for anything else (unknown strings, `nil`, non-strings)
 * and never raises, so this port never refuses a `locale` value either.
 * The port reproduces that on purpose: it stays byte-exact with the oracle,
 * and the gem's defect is logged in TODO.plan/deferred.md ("Formatter::
 * Standard ignores locale") to be fixed in both the gem and this port once
 * the byte-identical structure is complete. `formatter.options.decimal`/
 * `group` are the only way to change the symbols.
 */

import { RenderError } from "../core/errors";
import { assertKnownOptions } from "../core/render-options";
import {
  DEFAULT_BASE,
  DEFAULT_BASE_PREFIXES,
  type HexCapital,
  isSupportedBase,
  type NumberBase,
  resolveBaseNotation,
} from "./numbers/base-notation";
import { type FormattedNumber, formattedNumberText } from "./numbers/formatted-number";
import {
  type FormattedNotation,
  formattedExponent,
  formattedNotationText,
  isFormattedNotation,
  NOTATIONS,
  type Notation,
  type NotationFormat,
  renderNotation,
} from "./numbers/notation";
import { formatNumber, type NumericOptions } from "./numbers/number-renderer";
import { renderNumberText, semanticBaseParts, type TextTarget } from "./numbers/text-renderer";

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
 * default, taken straight from `Standard::DEFAULT_OPTIONS`.
 */
const DEFAULT_FRACTION_GROUP_MARKER = "'";
const DEFAULT_FRACTION_GROUP_DIGITS = 3;

/** `Formatter::Standard::DEFAULT_OPTIONS[:decimal]`. */
const DEFAULT_DECIMAL_MARKER = ".";
/** `Formatter::Standard::DEFAULT_OPTIONS[:group]`. */
const DEFAULT_GROUP_MARKER = ",";

/**
 * The `formatter.options` fields the numeric pipeline implements — `Formatter::
 * Standard::DEFAULT_OPTIONS`' decimal/group/group_digits triple, the
 * fraction-side grouping pair, and the digit-shaping keys `precision`,
 * `significant`, `digit_count`, `padding`, `padding_digits`,
 * `padding_group_digits` and `number_sign`, the notation keys `notation`,
 * `e`, `times` and `exponent_sign`, and the base keys `base`, `base_prefix`,
 * `base_postfix` and `hex_capital`. Every key that hash accepts is accepted
 * here; an unknown key is refused by `assertKnownOptions` below, never
 * silently accepted and ignored.
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
  /** 2, 8, 10 or 16; anything else is refused (the gem raises `UnsupportedBase`). */
  readonly base?: number | null;
  /** Given, even as `null`, it makes the base render as literal text (`base_prefix?`). */
  readonly basePrefix?: string | null;
  readonly basePostfix?: string | null;
  /** `true`, `"numbers_only"`, or anything else for none (`false`, `null`). */
  readonly hexCapital?: boolean | string | null;
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
  /** Accepted and inert: see the module header ("Locale"). */
  readonly locale?: unknown;
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
  "base",
  "basePrefix",
  "basePostfix",
  "hexCapital",
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
 * `FormatOptions#separator_option` (`format_options.rb:206`) for the
 * decimal, group and fraction-group markers. `undefined` (key absent) takes
 * the default; an explicit `null` is the gem's nil, whose meaning differs per
 * marker (`nullValue`): `decimal` and `fraction_group` render no marker at
 * all, `group` falls back to the default. A Boolean raises the gem's
 * `ConfigurationError` (`invalid_formatter_option`). The gem stringifies any
 * other type (`to_s`/`inspect`); this port's options are typed strings, so
 * every other non-string is refused, as `countOption` does.
 */
function separatorOption(
  value: unknown,
  key: string,
  fallback: string,
  nullValue: string,
  format: string,
): string {
  if (value === undefined) return fallback;
  if (value === null) return nullValue;
  if (typeof value !== "string") {
    throw new RenderError(
      `formatter.options.${key}: ${JSON.stringify(value)} is not a string — the gem raises ` +
        "ConfigurationError (invalid_formatter_option) for a Boolean",
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
 * `FormatOptions#base` + `BaseNotation.validate!` (`base_notation.rb:87`): the
 * base is 2, 8, 10 or 16, `null`/absent meaning 10. The gem raises
 * `Plurimath::Errors::UnsupportedBase` for anything else on the call that
 * renders the number; this refuses when the formatter is resolved. It also
 * coerces a numeric String (`"16"`); this port's options are typed, so a
 * string is refused, as `countOption` does.
 */
function baseOption(value: unknown, format: string): NumberBase {
  if (value === undefined || value === null) return DEFAULT_BASE;
  if (isSupportedBase(value)) return value;
  throw new RenderError(
    `formatter.options.base: ${JSON.stringify(value)} is not one of ` +
      `${Object.keys(DEFAULT_BASE_PREFIXES).join(", ")} — the gem raises ` +
      "Plurimath::Errors::UnsupportedBase (base_notation.rb)",
    format,
    "unknown",
  );
}

/**
 * `FormatOptions#hex_capital` (`format_options.rb:88`): nil, `true`, `false`,
 * or a String/Symbol; `"true"` is `true`, `"numbers_only"` is `:numbers_only`,
 * everything else (`false` included) is nil. Any other type raises
 * `ConfigurationError`, base 10 included.
 */
function hexCapitalOption(value: unknown, format: string): HexCapital {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean" && typeof value !== "string") {
    throw new RenderError(
      `formatter.options.hexCapital: ${JSON.stringify(value)} is not true, false, or a string`,
      format,
      "unknown",
    );
  }
  const text = String(value);
  if (text === "true") return true;
  return text === "numbers_only" ? "numbers_only" : null;
}

/**
 * `FormatOptions#base_prefix`/`#base_postfix` (`separator_option`): a string
 * or nil, never a Boolean. `undefined` (the key absent) stays `undefined`: the
 * gem tells "not given" (`symbols.key?`) from "given as nil", and only the
 * first leaves the default prefix and the semantic form in place.
 */
function affixOption(value: unknown, key: string, format: string): string | null | undefined {
  if (value === undefined || value === null || typeof value === "string") return value;
  throw new RenderError(
    `formatter.options.${key}: ${JSON.stringify(value)} is not a string`,
    format,
    "unknown",
  );
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
    decimal: separatorOption(options?.decimal, "decimal", DEFAULT_DECIMAL_MARKER, "", format),
    group: separatorOption(
      options?.group,
      "group",
      DEFAULT_GROUP_MARKER,
      DEFAULT_GROUP_MARKER,
      format,
    ),
    groupDigits: countOption(options?.groupDigits, "groupDigits", DEFAULT_GROUP_DIGITS, format),
    fractionGroup: separatorOption(
      options?.fractionGroup,
      "fractionGroup",
      DEFAULT_FRACTION_GROUP_MARKER,
      "",
      format,
    ),
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
    baseNotation: resolveBaseNotation(
      baseOption(options?.base, format),
      affixOption(options?.basePrefix, "basePrefix", format),
      affixOption(options?.basePostfix, "basePostfix", format),
      hexCapitalOption(options?.hexCapital, format),
    ),
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
 * What `Formatter::Numbers::MathmlRenderer.render` draws for one value: one
 * `<mn>` of plain text (a plain number, a base with a literal affix, an `e`
 * notation — all `to_s`); the `<msub>` parts when the number has a semantic
 * base (`base` set, no prefix or postfix given); or a `scientific`/
 * `engineering` notation's `<mrow>` parts (`render_notation`).
 */
export type MathmlNumber =
  | { readonly kind: "plain"; readonly text: string }
  | {
      readonly kind: "base";
      /** `FormattedNumber#sign_text`, `null` when there is none. */
      readonly sign: string | null;
      readonly digits: string;
      readonly base: number;
    }
  | {
      readonly kind: "notation";
      /** The coefficient's `to_s` (a semantic base is NOT drawn as `<msub>` here). */
      readonly coefficient: string;
      readonly times: string;
      /** `FormattedNotation#formatted_exponent`. */
      readonly exponent: string;
    };

/** The pipeline (or the notation branch), then `MathmlRenderer.render`'s choice. `value` must satisfy `isGemNumericValue`. */
export function formatNumberForMathml(value: string, format: NumberFormat): MathmlNumber {
  const formatted = formatNumberValue(value, format);
  if (isFormattedNotation(formatted)) {
    if (formatted.style === "e") return { kind: "plain", text: formattedNotationText(formatted) };
    return {
      kind: "notation",
      coefficient: formattedNumberText(formatted.coefficient),
      times: formatted.timesSymbol,
      exponent: formattedExponent(formatted),
    };
  }
  const semantic = semanticBaseParts(formatted);
  return semantic === null
    ? { kind: "plain", text: formattedNumberText(formatted) }
    : { kind: "base", ...semantic };
}

/**
 * `NumberFormatter#formatted_number`: the structured result — a
 * `FormattedNotation` when `notation` names a supported one (the gem branches
 * before the numeric pipeline), else the pipeline's `FormattedNumber`.
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
 * `Formatter::Numbers::TextRenderer.render` for one of the four text targets.
 * A notation is `FormattedNotation#to_s` whatever the target (the gem's
 * `structured_number?` is false for it, so a base coefficient keeps its
 * literal prefix and postfix and never takes a semantic template). A plain
 * number takes the target's text (`numbers/text-renderer.ts` — a semantic
 * base takes the target's template); without a `target` it is
 * `FormattedNumber#to_s`, the flat text. `value` must satisfy
 * `isGemNumericValue`.
 */
export function applyNumberFormat(
  value: string,
  format: NumberFormat,
  target?: TextTarget,
): string {
  const result = formatNumberValue(value, format);
  if (isFormattedNotation(result)) return formattedNotationText(result);
  return target === undefined ? formattedNumberText(result) : renderNumberText(result, target);
}
