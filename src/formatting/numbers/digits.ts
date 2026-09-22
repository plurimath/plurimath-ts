/**
 * `Formatter::Numbers::DigitSequence` (`digit_sequence.rb`) for base 10 — the
 * digit tests, the round-half-up threshold and the carry propagation the
 * fraction and significant-digit transforms share.
 *
 * Base 10 only: the gem's version is parameterized on the target base (its
 * `Base::HEX_ALPHANUMERIC` table, `threshold = base.div(2)`), and a base
 * lane generalizes this file, not its callers.
 */

export const DECIMAL_POINT = ".";

/** `DigitSequence#digit?`, restricted to the base-10 digits. */
export function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= "0" && char <= "9" && char.length === 1;
}

/** `DigitSequence#significant?` — a digit that is not zero. */
export function isSignificant(char: string | undefined): boolean {
  return isDigit(char) && char !== "0";
}

/** `DigitSequence#round_up?`: a digit at or past the half-way threshold, `5` in base 10. */
export function roundsUp(char: string | undefined): boolean {
  return isDigit(char) && Number(char) >= 5;
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
 * A `9` becomes `overflow` and the carry moves on; the first other digit is
 * incremented and stops it. Elements that are not digits (the decimal point,
 * an earlier `""` overflow) are stepped over. Returns a new list and whether
 * the carry ran off the end.
 */
export function incrementReversed(
  reversed: readonly string[],
  overflow: string,
): { readonly digits: string[]; readonly carry: boolean } {
  const digits = [...reversed];
  for (let index = 0; index < digits.length; index += 1) {
    const digit = digits[index];
    if (!isDigit(digit)) continue;
    if (digit === "9") {
      digits[index] = overflow;
    } else {
      digits[index] = String(Number(digit) + 1);
      return { digits, carry: false };
    }
  }
  return { digits, carry: true };
}
