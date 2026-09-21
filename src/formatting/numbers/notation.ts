/**
 * `Formatter::Numbers::NotationRenderer` (`notation_renderer.rb`) and
 * `FormattedNotation` (`formatted_notation.rb`) — the `e`, `scientific` and
 * `engineering` notations, for base 10.
 *
 * The gem takes this branch before `NumberRenderer#format`
 * (`NumberFormatter#formatted_number`): the value is split into a
 * coefficient's digits and an exponent, and the coefficient is localized
 * through `formatParts` (`number-renderer.ts`) — so `precision`,
 * `significant`, `digit_count`, grouping and `number_sign` all act on the
 * coefficient, and the exponent is applied outside them. The result is a
 * structured `FormattedNotation` beside `FormattedNumber`, so each output
 * format can lay it out its own way (`number-format.ts`'s `formatNumberValue`,
 * `render/number/mathml.ts`).
 *
 * Base notation (`base`, prefix/postfix) is another lane's: the coefficient
 * here is always base 10.
 */

import { type FormattedNumber, formattedNumberText } from "./formatted-number";
import { formatParts, type NumericOptions } from "./number-renderer";
import { NumberParts } from "./parts";
import { resolveNotationPrecision } from "./precision";
import { Source } from "./source";

/** `NotationRenderer::SUPPORTED_NOTATIONS`. */
export const NOTATIONS = ["e", "scientific", "engineering"] as const;
export type Notation = (typeof NOTATIONS)[number];

/** The formatter options the notation branch reads, beside `NumericOptions`. */
export interface NotationFormat {
  /** `notation`, when it names a supported notation; `null` for the plain path (`FormatOptions#notation_supported?`). */
  readonly notation: Notation | null;
  /** `FormatOptions#exponent_separator` — the `e` option. */
  readonly exponentSeparator: string;
  /** `FormatOptions#times`. */
  readonly times: string;
  /** `FormatOptions#exponent_sign`: only `"plus"` has an effect. */
  readonly exponentSign: string | null;
}

/** `FormattedNotation`: the localized coefficient, the exponent and how to join them. */
export interface FormattedNotation {
  readonly coefficient: FormattedNumber;
  readonly style: Notation;
  readonly exponent: number;
  readonly timesSymbol: string;
  readonly exponentSeparator: string;
  readonly exponentSign: string | null;
}

export function isFormattedNotation(
  result: FormattedNumber | FormattedNotation,
): result is FormattedNotation {
  return "style" in result;
}

/** `FormattedNotation#formatted_exponent` — `"0"` for zero, a `+` on a positive one under `exponent_sign: plus`. */
export function formattedExponent(notation: FormattedNotation): string {
  if (notation.exponent === 0) return "0";
  const prefix = notation.exponentSign === "plus" ? "+" : "";
  return notation.exponent < 0 ? `-${-notation.exponent}` : `${prefix}${notation.exponent}`;
}

/**
 * `FormattedNotation#to_s`: `1.5e3` for `e`, `1.5 x 10^3` for the other two.
 * The coefficient reads as `FormattedNumber#to_s` does, sign included.
 */
export function formattedNotationText(notation: FormattedNotation): string {
  const coefficient = formattedNumberText(notation.coefficient);
  const exponent = formattedExponent(notation);
  if (notation.style === "e") return `${coefficient}${notation.exponentSeparator}${exponent}`;
  return `${coefficient} ${notation.timesSymbol} 10^${exponent}`;
}

/** The coefficient's parts and the exponent, before localization. */
type NotationParts = readonly [NumberParts, number];

/** `NotationRenderer#notation_parts`: a zero keeps its own digits and exponent `0`. */
function notationParts(source: Source): NotationParts {
  if (source.isZero) return [source.toParts(null), 0];

  const parts = source.toParts(null);
  const [digits, exponent] = significantDigitsAndExponent(parts);
  return [new NumberParts(parts.sign, digits.slice(0, 1), digits.slice(1)), exponent];
}

/** `NotationRenderer#significant_digits_and_exponent`, over a value that is not zero. */
function significantDigitsAndExponent(parts: NumberParts): readonly [string, number] {
  if (parts.integerDigits === "0") {
    const index = parts.fractionDigits.search(/[1-9]/);
    return [parts.fractionDigits.slice(index), -(index + 1)];
  }
  const digits = `${parts.integerDigits}${parts.fractionDigits}`;
  const index = digits.search(/[1-9]/);
  return [digits.slice(index), parts.integerDigits.length - index - 1];
}

/**
 * `NotationRenderer#engineering_coefficient_parts`: move the point so the
 * exponent is a multiple of three. The integer part takes `exponent % 3 + 1`
 * digits (Ruby's modulo, never negative), zero-filled when the value has
 * fewer.
 */
function engineeringParts([coefficient, exponent]: NotationParts): NotationParts {
  const index = ((exponent % 3) + 3) % 3;
  const digits = `${coefficient.integerDigits}${coefficient.fractionDigits}`;
  const integerLength = index + 1;
  return [
    new NumberParts(
      coefficient.sign,
      digits.slice(0, integerLength).padEnd(integerLength, "0"),
      digits.slice(integerLength),
    ),
    exponent - index,
  ];
}

/**
 * `NotationRenderer#engineering_precision`. The inferred budget covers the
 * source's significant digits, and the engineering shift moves one to three of
 * them into the integer part, so the fraction budget subtracts the integer
 * width. Only a positive explicit precision is a literal fraction width;
 * `precision: 0` falls through to inference.
 */
function engineeringPrecision(
  source: Source,
  coefficient: NumberParts,
  precision: number,
  explicit: boolean,
  options: NumericOptions,
): number {
  if (explicit && precision > 0) return precision;
  if (source.isZero) return source.notationPrecision;

  const integerLength = coefficient.integerDigits.length;
  const budget = Math.max(options.significant, options.digitCount);
  if (budget <= 0) return Math.max(source.significantDigitCount - integerLength, 0);

  let fractionBudget = Math.max(budget - integerLength, 0);
  // One digit is left for Significant's rounding pass when the source carries
  // more digits than the budget.
  if (source.significantDigitCount > budget) fractionBudget += 1;
  return fractionBudget;
}

/**
 * `NotationRenderer#render`. `raw` must already satisfy the gem's
 * `NUMERIC_PATTERN`, and `options.notation` must be a supported notation.
 */
export function renderNotation(
  raw: string,
  notation: Notation,
  options: NumericOptions & NotationFormat,
): FormattedNotation {
  const source = new Source(raw);
  const explicit = options.precision !== null;
  const precision = resolveNotationPrecision(
    source,
    options.precision,
    options.significant,
    options.digitCount,
  );

  let [parts, exponent] = notationParts(source);
  let coefficientPrecision = precision;
  if (notation === "engineering") {
    if (!source.isZero) [parts, exponent] = engineeringParts([parts, exponent]);
    coefficientPrecision = engineeringPrecision(source, parts, precision, explicit, options);
  }

  return {
    coefficient: formatParts(parts, coefficientPrecision, options),
    style: notation,
    exponent,
    timesSymbol: options.times,
    exponentSeparator: options.exponentSeparator,
    exponentSign: options.exponentSign,
  };
}
