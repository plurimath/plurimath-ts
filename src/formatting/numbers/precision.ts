/**
 * `Formatter::Numbers::PrecisionResolver` (`precision_resolver.rb`) — which
 * precision wins for one render call, cut down to the basic base-10 path.
 *
 * An explicit precision (the `precision:` keyword, else `options[:precision]`)
 * always wins; without one, plain decimal rendering keeps the value's own
 * fraction width (`Source#decimal_precision`), so nothing is truncated and
 * nothing is padded.
 *
 * The resolver's other two rules are not here because the paths that reach
 * them are not: `significant_base_precision` only answers for a target base
 * other than 10 (`target_base?`), and the coefficient-width rule only for a
 * supported notation. The base and notation lanes add their rule to this
 * function, in the gem's order (explicit, then base, then notation).
 */

import type { Source } from "./source";

export function resolvePrecision(source: Source, explicit: number | null): number {
  return explicit ?? source.decimalPrecision;
}

/**
 * `PrecisionResolver#resolve`'s notation arm (`precision_resolver.rb:21`), the
 * precision a supported notation renders its coefficient with. An explicit
 * precision wins (zero included: the gem tests `if precision`, and `0` is
 * truthy in Ruby). Otherwise the coefficient keeps the source's significant
 * digits (`Source#notationPrecision`), widened to `budget - 1` when a
 * `significant` or `digit_count` budget asks for more digits (one digit
 * leads, so the fraction allowance is one less than the budget).
 */
export function resolveNotationPrecision(
  source: Source,
  explicit: number | null,
  significant: number,
  digitCount: number,
): number {
  if (explicit !== null) return explicit;
  const budget = Math.max(significant, digitCount);
  if (budget > 0) return Math.max(budget - 1, source.notationPrecision);
  return source.notationPrecision;
}
