/**
 * `Formatter::Numbers::FormattedNumber` (`formatted_number.rb`) — the
 * structured result of formatting one number: the sign, the grouped digit
 * parts and the decimal marker as separate elements, so each output format
 * can render them its own way. The four text formats and MathML all read
 * `formattedNumberText`.
 *
 * `baseNotation` carries the base, prefix and postfix. It is not applied to
 * the digit strings here: `digitsString` is the digits alone (hex-capitalized
 * when `hex_capital` is `true`), `formattedNumberText` adds the sign and the
 * affixes, and how a target draws a semantic base (`ff_(16)`, `<msub>`) is
 * `text-renderer.ts`'s and the MathML renderer's.
 */

import {
  type BaseNotation,
  isDefaultBase,
  upcaseHexDigits,
  upcasesHex,
  wrapBase,
} from "./base-notation";
import type { Sign } from "./parts";

export interface FormattedNumber {
  readonly sign: Sign;
  readonly integerPart: string;
  /** Already grouped; `""` when the number has no fraction. */
  readonly fractionPart: string;
  readonly decimalSeparator: string;
  readonly baseNotation: BaseNotation;
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

/**
 * `FormattedNumber#digits_string` — the digits and decimal marker, without the
 * sign, prefix or postfix. `hex_capital: true` upper-cases all of it, the
 * separators included (`FormattedNumber#upcase_hex`).
 */
export function digitsString(number: FormattedNumber): string {
  const assembled =
    number.fractionPart === ""
      ? number.integerPart
      : `${number.integerPart}${number.decimalSeparator}${number.fractionPart}`;
  return upcasesHex(number.baseNotation) ? upcaseHexDigits(assembled) : assembled;
}

/** `FormattedNumber#base_notation?`. */
export function hasBaseNotation(number: FormattedNumber): boolean {
  return !isDefaultBase(number.baseNotation);
}

/**
 * `FormattedNumber#to_s`: the sign, then the digits wrapped in the base
 * prefix and postfix (a base-10 number has neither).
 */
export function formattedNumberText(number: FormattedNumber): string {
  const digits = digitsString(number);
  const wrapped = hasBaseNotation(number) ? wrapBase(digits, number.baseNotation) : digits;
  return `${signText(number) ?? ""}${wrapped}`;
}
