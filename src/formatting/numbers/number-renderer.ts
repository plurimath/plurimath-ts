/**
 * `Formatter::Numbers::NumberRenderer` (`number_renderer.rb`) — the numeric
 * pipeline for the basic path, in the gem's order:
 *
 *   Source -> Parts (fraction truncated to the resolved precision)
 *          -> Fraction#apply_parts (zero padding, or the `digit_count` budget)
 *          -> Significant#apply_parts (when `significant` is positive)
 *          -> Integer/Fraction grouping -> FormattedNumber
 *
 * **The seam for the later lanes.** Everything between `Source` and
 * `FormattedNumber` works on `NumberParts` and knows nothing of notation or
 * base. Notation (`e`/`scientific`/`engineering`) is a branch the gem takes
 * BEFORE this pipeline (`number_formatter.rb`: `options.notation_supported?`
 * routes to `NotationRenderer` and never reaches `NumberRenderer#format`) and it
 * localizes its coefficient back through `formatParts`, so a notation module
 * calls `formatParts` and adds its own result type beside `FormattedNumber`.
 * Base notation wraps the finished digits (`FormattedNumber#base_notation`)
 * and converts them inside `formatParts`' integer and fraction steps, so a
 * base module extends `FormattedNumber` and the two `Integer`/`Fraction`
 * conversion hooks. Neither rewrites this file's order of steps.
 */

import type { FormattedNumber } from "./formatted-number";
import { applyFraction, type FractionFormat, formatFractionGroups } from "./fraction";
import { formatIntegerGroups, type IntegerFormat } from "./integer";
import type { NumberParts } from "./parts";
import { resolvePrecision } from "./precision";
import { applySignificant } from "./significant";
import { Source } from "./source";

/** The formatter options the numeric pipeline reads. */
export interface NumericOptions extends IntegerFormat, FractionFormat {
  readonly decimal: string;
  /** The explicit `precision` (keyword or `options[:precision]`); `null` leaves it to `resolvePrecision`. */
  readonly precision: number | null;
  readonly significant: number;
  readonly numberSign: string | null;
}

/**
 * `NumberRenderer#format_parts` (`number_renderer.rb:29`): everything after
 * the parts exist. The fraction is truncated to `precision` first (a second
 * time after `Source#to_parts`, which the gem does too).
 */
export function formatParts(
  parts: NumberParts,
  precision: number,
  options: NumericOptions,
): FormattedNumber {
  let current = parts.withDigits({
    fractionDigits: precision > 0 ? parts.fractionDigits.slice(0, precision) : "",
  });
  current = applyFraction(current, precision, options);
  if (options.significant > 0) current = applySignificant(current, options.significant);

  return {
    sign: current.sign,
    integerPart: formatIntegerGroups(current.integerDigits, options),
    fractionPart: current.fractional ? formatFractionGroups(current.fractionDigits, options) : "",
    decimalSeparator: options.decimal,
    numberSign: options.numberSign,
  };
}

/**
 * `NumberRenderer#format`. `raw` must already satisfy the gem's
 * `NUMERIC_PATTERN` (`number-format.ts`'s `isGemNumericValue`).
 */
export function formatNumber(raw: string, options: NumericOptions): FormattedNumber {
  const source = new Source(raw);
  const precision = resolvePrecision(source, options.precision);
  return formatParts(source.toParts(precision), precision, options);
}
