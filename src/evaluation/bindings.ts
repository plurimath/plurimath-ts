/**
 * Binding normalization — Ruby: `Evaluator#normalize_bindings` (`evaluator.rb`).
 *
 * The gem accepts a Hash-like `bindings` argument keyed by `String` or
 * `Symbol`, each value required to be `Numeric` and `#real?`. This port's
 * public bindings type is a plain JS object, `Readonly<Record<string,
 * number>>`: every JS object key is already a string, so the gem's
 * String-or-Symbol key duality collapses into "always a valid key" here —
 * `InvalidBindingKeyError` is defined (`errors.ts`) but unreachable through
 * this typed surface, and that is recorded there rather than reproduced with
 * a JavaScript `Symbol`, which is an unrelated runtime concept from Ruby's.
 *
 * The value check is not `Number.isFinite`: Ruby's `value.real?` is true for
 * `Float::INFINITY` and `Float::NAN` (both are real, non-complex Floats), so
 * an infinite or NaN binding passes normalization in the gem too — it is
 * caught later, by the evaluator's own finite-result check, as
 * `NonFiniteResultError`, not `InvalidBindingError` (measured: `a+1` with
 * `a: Float::INFINITY` raises `NonFiniteResultError`, not
 * `InvalidBindingError`). `typeof value === "number"` is the faithful JS
 * mirror of `Numeric && real?` for exactly that reason — it admits `NaN` and
 * `Infinity` and rejects everything JS has no `number` for.
 */

import { InvalidBindingError } from "./errors";

/** Ruby: `Formula#evaluate(bindings = {})`'s Hash-like argument. */
export type EvaluationBindings = Readonly<Record<string, number>>;

/** `Map<string, number>`, keyed by the gem's own normalized `key.to_s`. */
export type NormalizedBindings = ReadonlyMap<string, number>;

/**
 * The JS-native label `InvalidBindingError` reports in place of a Ruby class
 * name (`value.class`) — `typeof value`, with `null` and `Array` singled out
 * because `typeof null === "object"` and `typeof [] === "object"` would
 * otherwise both read "object", the least informative label available.
 */
export function describeBindingValueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function normalizeBindings(bindings: EvaluationBindings): NormalizedBindings {
  const normalized = new Map<string, number>();
  for (const [key, value] of Object.entries(bindings)) {
    if (typeof value !== "number") {
      throw new InvalidBindingError(key, describeBindingValueType(value));
    }
    normalized.set(key, value);
  }
  return normalized;
}
