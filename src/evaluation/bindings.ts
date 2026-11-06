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
 *
 * plurimath 0.11.13 also accepts an exact decimal string
 * (`exact_decimal_string?`: `/\A-?[0-9]+(\.[0-9]+)?\z/`, so `"0.5"` and
 * `"-12"`, not `"1e5"` or `"+1"`), read as a Rational in strict mode and a
 * Float otherwise (`evaluator.ts`); any other string is still an
 * `InvalidBindingError`.
 */

import { InvalidBindingError } from "./errors";

/** Ruby: `Formula#evaluate(bindings = {})`'s Hash-like argument. */
export type EvaluationBindings = Readonly<Record<string, number | string>>;

/** `Map<string, number | string>`, keyed by the gem's own normalized `key.to_s`. */
export type NormalizedBindings = ReadonlyMap<string, number | string>;

/** Ruby: `Evaluator#exact_decimal_string?`. */
const EXACT_DECIMAL_STRING = /^-?[0-9]+(?:\.[0-9]+)?$/;

/**
 * The Ruby class name `InvalidBindingError` interpolates for `value.class`
 * (`errors.ts`'s header) — mapped from the JS runtime type of a value that
 * reached this typed surface anyway (an untyped caller, `bindings.ts`'s own
 * header). Each mapped case is measured on the oracle
 * (`Formula#evaluate({a: <value>})`'s `InvalidBindingError#message`,
 * `scripts/generate-evaluation-fixtures.rb`'s `invalid-binding-*` rows):
 * a JS string is the Ruby value a caller would hand across as a `String`
 * binding, `true`/`false` correspond to Ruby's two boolean singleton
 * classes (`TrueClass`/`FalseClass`, not one shared `Boolean` — Ruby has no
 * such class), `null`/`undefined` are both `NilClass` (Ruby has one nil, JS
 * has two spellings of "absent"), a JS array is the Ruby value a caller
 * would build a `Hash`-like `Array` binding from, and a plain object is a
 * `Hash`, the structural analogue the gem's own bindings argument is.
 *
 * `bigint`, `function` and `symbol` have no oracle-measurable Ruby analogue:
 * nothing in the gem's own `Numeric`/String/Symbol-keyed world receives a
 * value shaped like a JS function or a JS `Symbol` (an unrelated runtime
 * concept from Ruby's own `Symbol`, `bindings.ts`'s header) or a `bigint`
 * (which normalizeBindings's own JS-numeric check rejects same as any other
 * non-`number`, never one the gem could have received as a Ruby `Numeric`
 * either). Each is labeled with its own JS type name, capitalized to match
 * the shape of the measured labels, rather than invented Ruby class fiction.
 */
export function describeBindingValueType(value: unknown): string {
  if (value === null || value === undefined) return "NilClass";
  if (value === true) return "TrueClass";
  if (value === false) return "FalseClass";
  if (typeof value === "string") return "String";
  if (Array.isArray(value)) return "Array";
  if (typeof value === "object") return "Hash";
  if (typeof value === "bigint") return "BigInt";
  if (typeof value === "function") return "Function";
  if (typeof value === "symbol") return "Symbol";
  return typeof value;
}

export function normalizeBindings(bindings: EvaluationBindings): NormalizedBindings {
  const normalized = new Map<string, number | string>();
  for (const [key, value] of Object.entries(bindings)) {
    const exactString = typeof value === "string" && EXACT_DECIMAL_STRING.test(value);
    if (typeof value !== "number" && !exactString) {
      throw new InvalidBindingError(key, describeBindingValueType(value));
    }
    normalized.set(key, value);
  }
  return normalized;
}
