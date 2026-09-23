/**
 * Base notation — `Formatter::Numbers::BaseNotation` (`base_notation.rb`) and
 * the two base-conversion hooks the gem keeps in `Integer#number_to_base` and
 * `Fraction#change_base`, plus `Base#capitalize_hex_digits`.
 *
 * The gem supports the bases 2, 8, 10 and 16. Base 10 is the default and
 * means "no base notation": it ignores `base_prefix`/`base_postfix` and
 * `hex_capital` entirely. Every other base converts the integer digits
 * (`numberToBase`) and generates the fraction digits from the exact decimal
 * fraction (`changeBase`), `precision` of them, so a fraction is truncated,
 * never rounded, into the target base.
 *
 * Nothing here reads a JavaScript number for a value: the integer conversion
 * is a `BigInt`, the fraction conversion is `BigInt` arithmetic over the
 * decimal digit string as a rational.
 */

import type { Source } from "./source";

/** `BaseNotation::DEFAULT_PREFIXES.keys`: the bases the gem's formatter accepts. */
export type NumberBase = 2 | 8 | 10 | 16;

/** `BaseNotation::DEFAULT_PREFIXES` — the prefix a base gets when the caller gives neither affix. */
export const DEFAULT_BASE_PREFIXES: Readonly<Record<NumberBase, string>> = {
  2: "0b",
  8: "0o",
  10: "",
  16: "0x",
};

/** `Base::DEFAULT_BASE`. */
export const DEFAULT_BASE: NumberBase = 10;

/**
 * `FormatOptions#hex_capital`: `true` upper-cases the whole rendered digit
 * string (separators included), `"numbers_only"` only the digits, before
 * they are padded and grouped; `null` is the gem's nil (also what `false` and
 * any unrecognised string normalize to).
 */
export type HexCapital = true | "numbers_only" | null;

/** `BaseNotation` — the resolved base, affixes and hex capitalization for one render. */
export interface BaseNotation {
  readonly base: NumberBase;
  /** The resolved prefix (`BaseNotation.resolve_prefix`). */
  readonly prefix: string;
  readonly postfix: string;
  readonly hexCapital: HexCapital;
  /** The caller passed `base_prefix` (even as nil). */
  readonly explicitPrefix: boolean;
  readonly explicitPostfix: boolean;
}

export function isSupportedBase(base: unknown): base is NumberBase {
  return base === 2 || base === 8 || base === 10 || base === 16;
}

/**
 * `BaseNotation.from_options` for an already-validated base. `prefix` and
 * `postfix` are `undefined` when the caller did not pass the key, `null` when
 * it passed nil (which the gem renders as `""` but still counts as given).
 */
export function resolveBaseNotation(
  base: NumberBase,
  prefix: string | null | undefined,
  postfix: string | null | undefined,
  hexCapital: HexCapital,
): BaseNotation {
  const explicitPrefix = prefix !== undefined;
  const explicitPostfix = postfix !== undefined;
  // `BaseNotation.resolve_prefix`: an explicit prefix wins; an explicit
  // postfix alone drops the default prefix.
  const resolvedPrefix = explicitPrefix
    ? (prefix ?? "")
    : explicitPostfix
      ? ""
      : DEFAULT_BASE_PREFIXES[base];
  return {
    base,
    prefix: resolvedPrefix,
    postfix: postfix ?? "",
    hexCapital,
    explicitPrefix,
    explicitPostfix,
  };
}

/** `BaseNotation#default?`. */
export function isDefaultBase(notation: BaseNotation): boolean {
  return notation.base === DEFAULT_BASE;
}

/**
 * `BaseNotation#literal?`: the caller gave a prefix or postfix, so the digits
 * render as text with those affixes and no format-specific decoration.
 */
export function isLiteralBase(notation: BaseNotation): boolean {
  return !isDefaultBase(notation) && (notation.explicitPrefix || notation.explicitPostfix);
}

/** `BaseNotation#semantic?`: a non-default base with neither affix given (`ff_(16)`, `<msub>`). */
export function isSemanticBase(notation: BaseNotation): boolean {
  return !isDefaultBase(notation) && !isLiteralBase(notation);
}

/** `BaseNotation#upcase_hex?`. */
export function upcasesHex(notation: BaseNotation): boolean {
  return notation.base === 16 && notation.hexCapital === true;
}

/** `BaseNotation#wrap`. */
export function wrapBase(digits: string, notation: BaseNotation): string {
  return `${notation.prefix}${digits}${notation.postfix}`;
}

/** `String#tr("abcdef", "ABCDEF")`. */
export function upcaseHexDigits(text: string): string {
  return text.replace(/[a-f]/g, (letter) => letter.toUpperCase());
}

/** `Base#capitalize_hex_digits`: only for `hex_capital: :numbers_only` in base 16. */
export function capitalizeHexDigits(digits: string, notation: BaseNotation): string {
  return notation.base === 16 && notation.hexCapital === "numbers_only"
    ? upcaseHexDigits(digits)
    : digits;
}

/**
 * `Integer#number_to_base` (`integer.rb:44`): `number.to_i.to_s(base)`, the
 * decimal integer digits re-written in `base` (lower-case letters).
 */
export function numberToBase(integerDigits: string, base: NumberBase): string {
  return base === DEFAULT_BASE ? integerDigits : BigInt(integerDigits).toString(base);
}

/**
 * `Fraction#change_base` (`fraction.rb:118`): the decimal fraction
 * `0.<digits>` as an exact rational, multiplied by `base` `precision` times,
 * the integer part of each product being the next digit. The caller
 * (`applyFraction`) sends only a fraction with a non-zero digit here.
 */
export function changeBase(fractionDigits: string, base: NumberBase, precision: number): string {
  const denominator = 10n ** BigInt(fractionDigits.length);
  const radix = BigInt(base);
  let numerator = BigInt(fractionDigits);
  let result = "";
  for (let step = 0; step < precision; step += 1) {
    numerator *= radix;
    const digit = numerator / denominator;
    result += digit.toString(base);
    numerator -= digit * denominator;
  }
  return result;
}

/**
 * `PrecisionResolver#significant_base_precision`: with no explicit precision
 * and a positive `significant`, a non-decimal target base infers how many
 * target-base fraction digits are needed to satisfy it. Capped at the value's
 * own significant digits (so `0.1` does not invent precision), plus one digit
 * when the source has more, so `Significant` can still do the final rounding.
 * `null` where the rule does not apply.
 */
export function significantBasePrecision(
  source: Source,
  base: NumberBase,
  significant: number,
): number | null {
  if (base === DEFAULT_BASE || significant === 0) return null;
  // `Source#fractional?`: the mantissa's fraction is longer than the exponent.
  if (!(source.fractionDigits.length > source.exponent)) return 0;

  // `Source#significant_digit_count`: mantissa digits, leading zeros stripped.
  const sourceSignificant = `${source.integerDigits}${source.fractionDigits}`.replace(
    /^0+/,
    "",
  ).length;
  const effective = Math.min(significant, sourceSignificant);
  const precision = Math.max(effective - targetBaseIntegerLength(source, base), 0);
  return sourceSignificant > effective ? precision + 1 : precision;
}

/** `Source#target_base_integer_length`: digits of the value's integer part in `base`; `0` for zero. */
function targetBaseIntegerLength(source: Source, base: NumberBase): number {
  const integer = BigInt(source.decimalDigits()[0]);
  return integer === 0n ? 0 : integer.toString(base).length;
}
