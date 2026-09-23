/**
 * `Formatter::Numbers::Significant` (`significant.rb`) — significant-digit
 * rounding on `NumberParts`, applied before any symbol is localized so
 * rounding never re-reads grouped or decimal-localized text.
 *
 * Rounds half up on the first discarded digit (the base's half-way digit: `5`
 * in base 10, `8` in base 16), carries through the kept
 * digits (`1999` to two significant digits is `2000`), and pads an integer
 * out with trailing zeros where digits were dropped (`112` to two is `110`).
 * A value with fewer significant digits than asked for is left as it is: the
 * gem never invents fraction digits here (`0.001` to three stays `0.001`).
 * The fraction's own padding is `fraction.ts`'s, ahead of this step.
 */

import {
  DECIMAL_POINT,
  digitCount,
  incrementReversed,
  isDigit,
  isSignificant,
  roundsUp,
  significantDigitCount,
} from "./digits";
import type { NumberParts } from "./parts";

/** `Significant#apply_parts` — `significant` is the caller's positive digit budget. */
export function applySignificant(
  parts: NumberParts,
  significant: number,
  base: number,
): NumberParts {
  const string = parts.fractional
    ? `${parts.integerDigits}${DECIMAL_POINT}${parts.fractionDigits}`
    : parts.integerDigits;
  const chars = [...string];
  if (skipsSignificantProcessing(chars, significant)) return parts;

  const signified = signify(chars, significant, base).join("");
  const pointAt = signified.indexOf(DECIMAL_POINT);
  if (pointAt === -1) return parts.withDigits({ integerDigits: signified, fractionDigits: "" });
  return parts.withDigits({
    integerDigits: signified.slice(0, pointAt),
    fractionDigits: signified.slice(pointAt + 1),
  });
}

/** `Significant#skip_significant_processing?`: an all-zero value, or exactly enough digits already. */
function skipsSignificantProcessing(chars: readonly string[], significant: number): boolean {
  return significantDigitCount(chars) === 0 || digitCount(chars) === significant;
}

/**
 * `Significant#process_chars` — copy characters until `significant` significant
 * digits are taken. `fractionPart` records whether a decimal point has been
 * SEEN, including at the character that ended the copy (the gem updates it
 * before its break check), so it is true for `1234.5` to four digits even
 * though the point was not copied.
 */
function processChars(
  chars: readonly string[],
  significant: number,
): { newChars: string[]; fractionPart: boolean; remaining: number } {
  let remaining = significant;
  let seenSignificant = false;
  let fractionPart = false;
  const newChars: string[] = [];
  for (const char of chars) {
    fractionPart ||= char === DECIMAL_POINT;
    seenSignificant ||= isSignificant(char);
    if (remaining === 0) break;

    newChars.push(char);
    if (!seenSignificant || !isDigit(char)) continue;
    remaining -= 1;
  }
  return { newChars, fractionPart, remaining };
}

/** `Significant#signify`. */
function signify(chars: readonly string[], significant: number, base: number): string[] {
  const taken = processChars(chars, significant);
  const { newChars, fractionPart } = taken;
  if (taken.remaining > 0) {
    if (!fractionPart) newChars.push(DECIMAL_POINT);
    return newChars;
  }

  let remainChars = digitCount(chars, fractionPart ? undefined : DECIMAL_POINT) - significant;
  let result = newChars;
  if (remainChars > 0) {
    result = roundChars(chars, newChars, fractionPart, base);
    if (fractionPart) remainChars = remainingFractionChars(result, significant);
  }
  const complete = fractionPart && significantDigitCount(result) === significant;
  if (!complete) result.push("0".repeat(Math.max(remainChars, 0)));
  return result;
}

/** `Significant#round_chars`: bump the kept digits when the first dropped digit rounds up. */
function roundChars(
  chars: readonly string[],
  result: string[],
  fractionPart: boolean,
  base: number,
): string[] {
  // The next digit to look at, stepping over a decimal point that was not copied.
  const at = isDigit(chars[result.length]) ? result.length : result.length + 1;
  if (!(at < chars.length && roundsUp(chars[at], base))) return result;

  const reversed = [...result].reverse();
  const rounded = fractionPart
    ? incrementFractional(reversed, base)
    : incrementInteger(reversed, base);
  return rounded.reverse();
}

/** `Significant#increment_fractional`. */
function incrementFractional(reversed: readonly string[], base: number): string[] {
  const pointAt = reversed.indexOf(DECIMAL_POINT);
  if (pointAt === -1) return incrementInteger(reversed, base);

  const fraction = reversed.slice(0, pointAt);
  const integer = reversed.slice(pointAt + 1);
  const bumped = incrementReversed(fraction, "", base);
  if (!bumped.carry) return [...bumped.digits, DECIMAL_POINT, ...integer];
  return [...bumped.digits, "", ...incrementInteger(integer, base)];
}

/** `Significant#increment_integer`. */
function incrementInteger(reversed: readonly string[], base: number): string[] {
  const { digits, carry } = incrementReversed(reversed, "0", base);
  if (carry) digits.push("1");
  return digits;
}

/** `Significant#remaining_fraction_chars`. */
function remainingFractionChars(chars: readonly string[], significant: number): number {
  if (!chars.includes(DECIMAL_POINT)) return 0;
  return Math.max(significant - significantDigitCount(chars), 0);
}
