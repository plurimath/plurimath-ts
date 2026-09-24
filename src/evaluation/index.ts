/**
 * `evaluation` — `evaluate(formula, bindings, options)` (ARCHITECTURE.md §3,
 * rule 6). Imports `core` only; nothing else under `src/` imports this module
 * back, and the root entry re-exports it so `parse(...).evaluate` style usage
 * is available from the batteries-included entry.
 *
 * **This slice (B6, first slice):** `Number`/`Symbol`/binary-arithmetic
 * evaluation only — `+`, binary and unary `-`, unary `+`, `*`, `/`, `^`,
 * implicit multiplication, and grouping parentheses, over AsciiMath input.
 * Every node the gem evaluates but this slice has not ported (`mod`,
 * `Sum`/`Prod` and their iteration cap, every trig/hyperbolic/log/exp/gcd/
 * lcm/min/max/abs/ceil/floor/sqrt/root function, `Fenced` argument lists,
 * `Text#evaluate`) raises `core`'s `UnsupportedFeatureError` (feature
 * `"evaluate"`): a port gap, not an answer about the expression.
 * `UnsupportedExpressionError` is kept for exactly the refusals the gem
 * itself makes — a malformed number, a missing operand, a stray operator or
 * token, and a node class with no `#evaluate` of its own —
 * `TODO.plan/feature-roadmap.md`'s evaluation entry has the rest of the plan.
 *
 * `options` is reserved for later slices (the gem's `Formula#evaluate` itself
 * takes only `bindings` — this module-function signature is the port's own,
 * per §3 — a per-call iteration cap being the leading candidate, alongside
 * the formatter's own per-call design in `feature-roadmap.md`) and currently
 * accepts no keys.
 */

import type { FormulaNode } from "../core/nodes";
import type { EvaluationBindings } from "./bindings";
import { Evaluator } from "./evaluator";

export type { EvaluationBindings } from "./bindings";
export type { EvaluationErrorCode } from "./errors";
export {
  DivisionByZeroError,
  EvaluationError,
  InvalidBindingError,
  InvalidBindingKeyError,
  MathDomainError,
  MissingVariableError,
  NonFiniteResultError,
  UnsupportedExpressionError,
} from "./errors";

/** Reserved for later slices (see the module header); accepts no keys yet. */
export type EvaluationOptions = Record<string, never>;

/**
 * Ruby: `Formula#evaluate(bindings = {})`, as the module function §3 reserves.
 *
 * Returns a `number` — the gem's README documents numeric results (`5.0`,
 * `9`) and Float division, and nothing beyond them. Ruby's Integer-versus-
 * Float distinction (`9` versus `5.0`) is not observable in JavaScript: both
 * come back as the same `number`. Intermediate values are computed exactly,
 * as Ruby computes them (`2^100/2^99` is `2`); where Ruby's FINAL answer has
 * no exact JS `number` — an Integer outside `Number.isSafeInteger` (`2^100`)
 * or a Rational (`2^(-1)`) — this throws `UnsupportedFeatureError` instead of
 * answering with a rounded value.
 * A binding holding a safe integer is taken as a Ruby Integer and any other
 * number as a Float, since JavaScript cannot tell `2` from `2.0`.
 *
 * @throws {UnsupportedFeatureError} a construct the gem evaluates that this
 *   slice has not ported; a final result JavaScript cannot represent exactly;
 *   a Float power inside glibc's rounding band; a Ruby `ArgumentError`; or an
 *   exact intermediate beyond the port's size limit.
 * @throws {EvaluationError} one of the gem's own evaluation errors
 *   (`DivisionByZeroError`, `MathDomainError`, `NonFiniteResultError`,
 *   `UnsupportedExpressionError`, `MissingVariableError`,
 *   `InvalidBindingError`).
 */
export function evaluate(
  formula: FormulaNode,
  bindings: EvaluationBindings = {},
  _options: EvaluationOptions = {},
): number {
  return Evaluator.run(formula, bindings);
}
