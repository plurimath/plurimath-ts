/**
 * `Formatter::Numbers::Source` (`source.rb`) — the raw input digits, cut down
 * to what the basic (non-notation, base-10) render path reads: the sign, and
 * the integer/fraction digit strings once the value's own exponent has been
 * folded in (`Source#decimal_digits`).
 *
 * The gem also holds a `BigDecimal` of the input. Nothing this path reads
 * needs one: every digit string is derived from the raw text by exact string
 * arithmetic, so no JavaScript number ever touches a value. A later notation
 * lane will want `decimal.zero?` and `notation_precision`; both are string
 * questions over the same fields and belong here.
 */

import { NumberParts, type Sign } from "./parts";

/**
 * `Source::NUMERIC_PATTERN` (`source.rb:18`) is enforced by the caller
 * (`number-format.ts`'s `isGemNumericValue`) before a `Source` is built, so
 * this parse assumes a value that already matched it.
 */
const NUMERIC_PARSE = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i;

export class Source {
  readonly sign: Sign;
  /** `Source#integer_digits` — the mantissa's digits left of the point (`"0"` when empty). */
  readonly integerDigits: string;
  /** `Source#fraction_digits` — the mantissa's digits right of the point. */
  readonly fractionDigits: string;
  /** `Source#exponent` — the `e` suffix, `0` when absent. */
  readonly exponent: number;

  constructor(raw: string) {
    const match = NUMERIC_PARSE.exec(raw);
    if (match === null) {
      throw new TypeError(`Source: ${JSON.stringify(raw)} does not match the numeric pattern`);
    }
    this.sign = match[1] === "-" ? -1 : 1;
    this.integerDigits = match[2] === "" ? "0" : (match[2] as string);
    this.fractionDigits = match[3] ?? "";
    this.exponent = match[4] === undefined ? 0 : Number.parseInt(match[4], 10);
  }

  /**
   * `Source#decimal_digits` (`source.rb:120`) — the mantissa's digits with the
   * decimal point moved by the exponent, as `[integer, fraction]`.
   */
  decimalDigits(): readonly [string, string] {
    const digits = `${this.integerDigits}${this.fractionDigits}`;
    const decimalIndex = this.integerDigits.length + this.exponent;

    if (decimalIndex <= 0) return ["0", `${"0".repeat(-decimalIndex)}${digits}`];
    if (decimalIndex >= digits.length) {
      return [`${digits}${"0".repeat(decimalIndex - digits.length)}`, ""];
    }
    return [digits.slice(0, decimalIndex), digits.slice(decimalIndex)];
  }

  /** `Source#decimal_precision` — how many fraction digits the value has as written. */
  get decimalPrecision(): number {
    return this.decimalDigits()[1].length;
  }

  /**
   * `Source#to_parts` (`source.rb:63`): the digits as `NumberParts`, the
   * fraction truncated to `precision` digits when one is given. Truncated,
   * not rounded (`apply_precision`, `source.rb:111`); a non-positive
   * precision leaves no fraction at all.
   */
  toParts(precision: number | null): NumberParts {
    const [integer, fraction] = this.decimalDigits();
    return new NumberParts(this.sign, integer, applyPrecision(fraction, precision));
  }
}

function applyPrecision(fraction: string, precision: number | null): string {
  if (precision === null) return fraction;
  return precision > 0 ? fraction.slice(0, precision) : "";
}
