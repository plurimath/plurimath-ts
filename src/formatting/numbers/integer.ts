/**
 * `Formatter::Numbers::Integer` (`integer.rb`) — the integer side's hex
 * capitalization, padding and digit grouping (`Integer#format_groups`). The
 * base conversion (`number_to_base`) is `base-notation.ts`'s `numberToBase`,
 * applied by `number-renderer.ts` before the fraction step.
 */

import { type BaseNotation, capitalizeHexDigits } from "./base-notation";

export interface IntegerFormat {
  readonly baseNotation: BaseNotation;
  readonly group: string;
  readonly groupDigits: number;
  readonly padding: string;
  readonly paddingDigits: number;
  readonly paddingGroupDigits: number;
}

/** `Integer#padding_target_width` (`integer.rb:59`). */
function paddingTargetWidth(length: number, format: IntegerFormat): number {
  if (format.paddingDigits > 0) return format.paddingDigits;
  if (format.paddingGroupDigits <= 0) return length;

  const remainder = length % format.paddingGroupDigits;
  return remainder === 0 ? length : length + format.paddingGroupDigits - remainder;
}

/** `Integer#pad_integer` — left-pad with the padding character up to the target width. */
function padInteger(digits: string, format: IntegerFormat): string {
  const target = paddingTargetWidth(digits.length, format);
  return target > digits.length ? format.padding.repeat(target - digits.length) + digits : digits;
}

/**
 * `Integer#format_groups` (`integer.rb:24`) — capitalize (`numbers_only`), pad, then chop `groupDigits`
 * digits off the right, repeatedly, and join right-to-left with the group
 * marker. `groupDigits: 0` disables grouping (the padding still applies).
 */
export function formatIntegerGroups(integerDigits: string, format: IntegerFormat): string {
  const padded = padInteger(capitalizeHexDigits(integerDigits, format.baseNotation), format);
  const size = format.groupDigits;
  if (size <= 0 || padded.length <= size) return padded;

  const tokens: string[] = [];
  let remaining = padded;
  while (remaining.length > size) {
    tokens.unshift(remaining.slice(remaining.length - size));
    remaining = remaining.slice(0, remaining.length - size);
  }
  tokens.unshift(remaining);
  return tokens.join(format.group);
}
