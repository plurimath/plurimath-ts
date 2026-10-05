/**
 * `Formatter::Numbers::PrecisionResolver` (`precision_resolver.rb`) — which
 * precision wins for one render call, for the plain path and the notation path.
 *
 * An explicit precision (the `precision:` keyword, else `options[:precision]`)
 * always wins; without one, plain decimal rendering keeps the value's own
 * fraction width (`Source#decimal_precision`), so nothing is truncated and
 * nothing is padded.
 *
 * The base rule sits between them (`significant_base_precision`, only for a
 * target base other than 10 with a positive `significant`). The notation
 * rule (`resolveNotationPrecision`) comes last, in the gem's order (explicit,
 * then base, then notation).
 */

import { type NumberBase, significantBasePrecision } from "./base-notation";
import type { Source } from "./source";

export function resolvePrecision(
  source: Source,
  explicit: number | null,
  base: { readonly base: NumberBase; readonly significant: number },
): number {
  if (explicit !== null) return explicit;
  return significantBasePrecision(source, base.base, base.significant) ?? source.decimalPrecision;
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
  base: { readonly base: NumberBase; readonly significant: number },
  digitCount: number,
): number {
  if (explicit !== null) return explicit;
  // The gem's order is explicit, then the base rule, then the notation rule.
  const baseRule = significantBasePrecision(source, base.base, base.significant);
  if (baseRule !== null) return baseRule;
  const significant = base.significant;
  const budget = Math.max(significant, digitCount);
  if (budget > 0) return Math.max(budget - 1, source.notationPrecision);
  return source.notationPrecision;
}
