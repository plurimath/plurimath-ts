/**
 * `Formatter::Numbers::Fraction` (`fraction.rb`) — the fraction side's
 * preparation on `NumberParts` (`Fraction#apply_parts`: conversion to the
 * target base, then zero padding to the resolved precision, or the
 * `digit_count` budget) and its digit grouping (`Fraction#format_groups`).
 */

import { type BaseNotation, capitalizeHexDigits, changeBase } from "./base-notation";
import { incrementReversed, roundsUp } from "./digits";
import type { NumberParts } from "./parts";

export interface FractionFormat {
  readonly baseNotation: BaseNotation;
  readonly fractionGroup: string;
  readonly fractionGroupDigits: number;
  /** The total-digit budget (`digit_count`); `0` means none. */
  readonly digitCount: number;
}

/**
 * `Fraction#apply_parts` (`fraction.rb:24`). A precision that is not positive
 * drops the fraction outright — before `digit_count` is consulted, so a
 * digit budget never pads a value that has no fraction to pad. Otherwise the
 * fraction is padded with zeros to `precision` digits, or, under a
 * `digit_count`, fitted to that many digits in total.
 */
export function applyFraction(
  parts: NumberParts,
  precision: number,
  format: FractionFormat,
): NumberParts {
  if (precision <= 0) return parts.withDigits({ fractionDigits: "" });

  // `change_base` runs only for a fraction with a non-zero digit: an all-zero
  // fraction is the same in every base and is kept at its own length (the
  // base-10 truncation to `precision` is not done for another base).
  const { base } = format.baseNotation;
  const fraction =
    base !== 10 && /[1-9]/.test(parts.fractionDigits)
      ? changeBase(parts.fractionDigits, base, precision)
      : parts.fractionDigits;

  if (format.digitCount > 0) {
    return parts.withDigits(fitDigitCount(parts.integerDigits, fraction, format.digitCount, base));
  }
  return parts.withDigits({ fractionDigits: fraction.padEnd(precision, "0") });
}

interface FittedDigits {
  readonly integerDigits: string;
  readonly fractionDigits: string;
}

/**
 * `Fraction#digit_count_format` (`fraction.rb:73`) — `digit_count` is a total
 * visible-digit budget, so rounding the fraction can carry back into the
 * integer digits. A value with fewer digits is padded with trailing zeros;
 * one with exactly enough is left alone.
 */
function fitDigitCount(
  integerDigits: string,
  fraction: string,
  budget: number,
  base: number,
): FittedDigits {
  const total = integerDigits.length + fraction.length;
  if (total < budget) {
    return { integerDigits, fractionDigits: fraction + "0".repeat(budget - total) };
  }
  if (total === budget) return { integerDigits, fractionDigits: fraction };

  // More digits than the budget: within the integer's own length the whole
  // fraction goes and only its first digit decides the integer's rounding.
  if (budget <= integerDigits.length) {
    const rounded = roundsUp(fraction[0], base)
      ? roundInteger(integerDigits, [], base)
      : { integerDigits };
    return { integerDigits: rounded.integerDigits, fractionDigits: "" };
  }
  return roundFraction(integerDigits, fraction, budget, base);
}

/**
 * `Fraction#round_base_string` — keep the digits the budget leaves room for,
 * looking one past them to round half up. A carry out of the fraction goes
 * into the integer, which then owns one more digit, so a fraction digit is
 * given up to keep the total at the budget.
 */
function roundFraction(
  integerDigits: string,
  fraction: string,
  budget: number,
  base: number,
): FittedDigits {
  const room = budget - integerDigits.length;
  const digits = [...fraction.slice(0, room + 1)];
  const discarded = digits.pop();
  if (discarded === undefined) return { integerDigits, fractionDigits: "" };
  if (!roundsUp(discarded, base)) return { integerDigits, fractionDigits: digits.join("") };

  const bumped = incrementReversed(digits.reverse(), "0", base);
  if (!bumped.carry) {
    return { integerDigits, fractionDigits: bumped.digits.reverse().join("") };
  }
  const carried = roundInteger(integerDigits, bumped.digits, base);
  return { integerDigits: carried.integerDigits, fractionDigits: bumped.digits.reverse().join("") };
}

/**
 * `Fraction#round_integer` — add one to the integer digits. When that carries
 * out of the top digit the integer gains a leading `1` and the most
 * significant of the (reversed) fraction digits handed in is dropped, which
 * is why the list is taken by reference: the caller's fraction shrinks with it.
 */
function roundInteger(
  integerDigits: string,
  fractionReversed: string[],
  base: number,
): { readonly integerDigits: string } {
  const { digits, carry } = incrementReversed([...integerDigits].reverse(), "0", base);
  const incremented = digits.reverse().join("");
  if (!carry) return { integerDigits: incremented };
  fractionReversed.pop();
  return { integerDigits: `1${incremented}` };
}

/**
 * `Fraction#format_groups`/`#change_format` (`fraction.rb:53`) — chop
 * `fractionGroupDigits` digits off the LEFT, repeatedly, and join
 * left-to-right with the fraction marker, so a short leftover chunk lands
 * last. `0` disables grouping, as it does on the integer side.
 */
export function formatFractionGroups(fractionDigits: string, format: FractionFormat): string {
  const digits = capitalizeHexDigits(fractionDigits, format.baseNotation);
  const size = format.fractionGroupDigits;
  if (size <= 0 || digits.length <= size) return digits;

  const tokens: string[] = [];
  for (let at = 0; at < digits.length; at += size) tokens.push(digits.slice(at, at + size));
  return tokens.join(format.fractionGroup);
}
