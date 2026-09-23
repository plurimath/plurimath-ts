/**
 * `Formatter::Numbers::DigitSequence` (`digit_sequence.rb`) — the digit tests,
 * the round-half-up threshold and the carry propagation the fraction and
 * significant-digit transforms share, parameterized on the target base the
 * way the gem's is.
 *
 * `isDigit` answers for all sixteen `Base::HEX_ALPHANUMERIC` characters
 * whatever the base (the gem's `digit?` is a lookup in that one table), which
 * is safe: the digit strings these functions see hold only digits below the
 * target base. The lower-case letters only — capitalization happens after
 * every step that calls in here.
 */

export const DECIMAL_POINT = ".";

/** `Base::HEX_ALPHANUMERIC`. */
const ALPHANUMERIC = "0123456789abcdef";

/** `Base::DIGIT_VALUE` — a digit character's value, `undefined` for anything else. */
function digitValue(char: string | undefined): number | undefined {
  if (char === undefined || char.length !== 1) return undefined;
  const value = ALPHANUMERIC.indexOf(char);
  return value === -1 ? undefined : value;
}

/** `DigitSequence#digit?`. */
export function isDigit(char: string | undefined): boolean {
  return digitValue(char) !== undefined;
}

/** `DigitSequence#significant?` — a digit that is not zero. */
export function isSignificant(char: string | undefined): boolean {
  return (digitValue(char) ?? 0) > 0;
}

/** `DigitSequence#round_up?`: a digit at or past the half-way threshold, `base.div(2)`. */
export function roundsUp(char: string | undefined, base: number): boolean {
  const value = digitValue(char);
  return value !== undefined && value >= Math.floor(base / 2);
}

/**
 * `DigitSequence#digit_count` — the digits in `chars`, stopping at the first
 * `stopAt` character when one is given.
 */
export function digitCount(chars: readonly string[], stopAt?: string): number {
  let count = 0;
  for (const char of chars) {
    if (stopAt !== undefined && char === stopAt) break;
    if (isDigit(char)) count += 1;
  }
  return count;
}

/** `DigitSequence#significant_digit_count` — digits from the first non-zero one on. */
export function significantDigitCount(chars: readonly string[]): number {
  let counting = false;
  let count = 0;
  for (const char of chars) {
    if (!isDigit(char)) continue;
    if (isSignificant(char)) counting = true;
    if (counting) count += 1;
  }
  return count;
}

/**
 * `DigitSequence#increment_reversed` with the gem's default `carry: 1` (every
 * caller passes one) — add one to a digit list held least-significant-first.
 * The base's top digit (`9` in base 10) becomes `overflow` and the carry moves
 * on; the first other digit is
 * incremented and stops it. Elements that are not digits (the decimal point,
 * an earlier `""` overflow) are stepped over. Returns a new list and whether
 * the carry ran off the end.
 */
export function incrementReversed(
  reversed: readonly string[],
  overflow: string,
  base: number,
): { readonly digits: string[]; readonly carry: boolean } {
  const digits = [...reversed];
  for (let index = 0; index < digits.length; index += 1) {
    const digit = digits[index];
    if (!isDigit(digit)) continue;
    const value = digitValue(digit) as number;
    if (value === base - 1) {
      digits[index] = overflow;
    } else {
      digits[index] = ALPHANUMERIC[value + 1] as string;
      return { digits, carry: false };
    }
  }
  return { digits, carry: true };
}
