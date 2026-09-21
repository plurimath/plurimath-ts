/**
 * `Formatter::Numbers::FormattedNumber` (`formatted_number.rb`) — the
 * structured result of formatting one number: the sign, the grouped digit
 * parts and the decimal marker as separate elements, so each output format
 * can render them its own way. The four text formats and MathML all read
 * `formattedNumberText`.
 *
 * `baseNotation` (prefix, postfix, the semantic `_(16)` form) is deliberately
 * absent: it belongs to the base lane, which adds it here and to
 * `formattedNumberText`'s `to_s` counterpart without touching the digit
 * pipeline.
 */

import type { Sign } from "./parts";

export interface FormattedNumber {
  readonly sign: Sign;
  readonly integerPart: string;
  /** Already grouped; `""` when the number has no fraction. */
  readonly fractionPart: string;
  readonly decimalSeparator: string;
  /** `number_sign` as the gem normalizes it: only `"plus"` has an effect. */
  readonly numberSign: string | null;
}

/**
 * `FormattedNumber#sign_text` (`formatted_number.rb:45`): `-` for a negative
 * value, `+` when `number_sign` is `plus`, none otherwise.
 */
export function signText(number: FormattedNumber): string | null {
  if (number.sign === -1) return "-";
  return number.numberSign === "plus" ? "+" : null;
}

/** `FormattedNumber#digits_string` — the digits and decimal marker, without the sign. */
export function digitsString(number: FormattedNumber): string {
  return number.fractionPart === ""
    ? number.integerPart
    : `${number.integerPart}${number.decimalSeparator}${number.fractionPart}`;
}

/** `FormattedNumber#to_s` for a number with no base notation: the sign then the digits. */
export function formattedNumberText(number: FormattedNumber): string {
  return `${signText(number) ?? ""}${digitsString(number)}`;
}
