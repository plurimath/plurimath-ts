/**
 * `evaluation` — `evaluate(formula, bindings, options)` (ARCHITECTURE.md §3,
 * rule 6). Imports `core` only; nothing else under `src/` imports this module
 * back, and the root entry re-exports it so `parse(...).evaluate` style usage
 * is available from the batteries-included entry.
 *
 * **This slice (B6, first slice):** `Number`/`Symbol`/binary-arithmetic
 * evaluation only — `+`, binary and unary `-`, unary `+`, `*`, `/`, `^`,
 * implicit multiplication, and grouping parentheses, over AsciiMath input.
 * Everything else (`mod`, `Sum`/`Prod` and their iteration cap, every
 * trig/hyperbolic/log/exp/gcd/lcm/min/max/abs/ceil/floor/sqrt/root function,
 * `Fenced` argument lists, `Text#evaluate`) raises `UnsupportedExpressionError`
 * the same way an unimplemented `Core#evaluate` does in the gem —
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

/** Ruby: `Formula#evaluate(bindings = {})`, as the module function §3 reserves. */
export function evaluate(
  formula: FormulaNode,
  bindings: EvaluationBindings = {},
  _options: EvaluationOptions = {},
): number {
  return Evaluator.run(formula, bindings);
}
