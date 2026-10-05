/**
 * `Formatter::Numbers::Parts` (`parts.rb`) — the normalized digit value the
 * numeric transforms (`fraction.ts`, `significant.ts`) pass between one
 * another before any symbol is applied: a sign, the integer digits and the
 * fraction digits, all base-10 digit strings. Everything downstream of
 * `Source#to_parts` works on this and never re-parses rendered text.
 *
 * This is the seam a later notation renderer and base renderer plug into
 * (`number-renderer.ts`): both consume and produce `NumberParts`.
 */

/** The sign as the gem stores it: `-1` when the raw text starts with `-`, else `1`. */
export type Sign = 1 | -1;

/**
 * `Parts#initialize`'s `normalize_integer` (`parts.rb:63`):
 * `value.to_s.sub(/\A0+(?=.)/, "")`, an empty result becoming `"0"`. Leading
 * zeros go, but the last digit stays, so `"000"` is `"0"` and `"007"` is `"7"`.
 */
function normalizeInteger(digits: string): string {
  const stripped = digits.replace(/^0+(?=.)/s, "");
  return stripped === "" ? "0" : stripped;
}

export class NumberParts {
  readonly sign: Sign;
  readonly integerDigits: string;
  readonly fractionDigits: string;

  constructor(sign: Sign, integerDigits: string, fractionDigits: string) {
    this.sign = sign;
    this.integerDigits = normalizeInteger(integerDigits);
    this.fractionDigits = fractionDigits;
  }

  /** `Parts#fractional?`. */
  get fractional(): boolean {
    return this.fractionDigits !== "";
  }

  /** `Parts#with_digits` — a copy with either digit string replaced. */
  withDigits(digits: { integerDigits?: string; fractionDigits?: string }): NumberParts {
    return new NumberParts(
      this.sign,
      digits.integerDigits ?? this.integerDigits,
      digits.fractionDigits ?? this.fractionDigits,
    );
  }
}
