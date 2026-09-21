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
