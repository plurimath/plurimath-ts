/**
 * `evaluation` — `evaluate(formula, bindings, options)` (ARCHITECTURE.md §3,
 * rule 6). Imports `core` only; nothing else under `src/` imports this module
 * back, and the root entry re-exports it so `parse(...).evaluate` style usage
 * is available from the batteries-included entry.
 *
 * **Ported:** `Number`/`Symbol`/binary-arithmetic evaluation (`+`, binary and
 * unary `-`, unary `+`, `*`, `/`, `^`, implicit multiplication, grouping
 * parentheses); `Abs`, `Ceil`, `Floor`, `Gcd`, `Lcm`, `Min`, `Max` (with
 * comma argument lists), `Mod`, `Root`, `Text` variable lookup, and the
 * bounded `Sum`/`Prod` iterations with their step cap; and the `Math` module
 * functions `Sin`, `Cos`, `Tan`, `Cot`, `Sec`, `Csc`, `Arcsin`, `Arccos`,
 * `Arctan`, `Exp`, `Ln` and `Sqrt` (`libm.ts`: correctly rounded, refused
 * where glibc's answer is not reliably the correctly rounded one). Every node
 * the gem evaluates but this port has not ported (`Sinh`, `Cosh`, `Tanh`,
 * `Sech`, `Csch`, `Coth`, `Lg` and `Log`, pending a licensing decision about
 * copying C-library code) raises `core`'s `UnsupportedFeatureError` (feature
 * `"evaluate"`): a port gap, not an answer about the expression.
 * `UnsupportedExpressionError` is kept for exactly the refusals the gem
 * itself makes — a malformed number, a missing operand, a stray operator or
 * token, and a node class with no `#evaluate` of its own —
 * `TODO.plan/feature-roadmap.md`'s evaluation entry has the rest of the plan.
 *
 * `options` is the port's own (the gem's `Formula#evaluate` takes only
 * `bindings`, and reads its one evaluation setting from global
 * configuration): `EvaluationOptions` below.
 */

import type { FormulaNode } from "../core/nodes";
import type { EvaluationBindings } from "./bindings";
import { DEFAULT_MAX_ITERATIONS, Evaluator } from "./evaluator";

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

/** Per-call evaluation settings. */
export interface EvaluationOptions {
  /**
   * Ruby: `Plurimath.configuration.evaluation_max_iterations` — the most
   * steps one `Sum`/`Prod` may take (`to - from + 1`); a larger range raises
   * `UnsupportedExpressionError` ("iteration range larger than N steps")
   * before any step runs. Defaults to the gem's `100_000`
   * (`configuration.rb`); `null` disables the cap, as `nil` does in the gem.
   */
  readonly evaluationMaxIterations?: number | null | undefined;
}

/** The cap an `EvaluationOptions` asks for, checked for an untyped caller. */
function maxIterationsOption(options: EvaluationOptions): number | null {
  const value = options.evaluationMaxIterations;
  if (value === undefined) return DEFAULT_MAX_ITERATIONS;
  if (value === null || typeof value === "number") return value;
  throw new TypeError(`evaluationMaxIterations must be a number or null (given ${typeof value})`);
}

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
 *   port has not ported; a final result JavaScript cannot represent exactly;
 *   a Float power or `Math` function result inside glibc's rounding band; a
 *   Ruby `ArgumentError`; or an exact intermediate beyond the port's size
 *   limit.
 * @throws {TypeError} `options.evaluationMaxIterations` is neither a number
 *   nor `null`.
 * @throws {EvaluationError} one of the gem's own evaluation errors
 *   (`DivisionByZeroError`, `MathDomainError`, `NonFiniteResultError`,
 *   `UnsupportedExpressionError`, `MissingVariableError`,
 *   `InvalidBindingError`).
 */
export function evaluate(
  formula: FormulaNode,
  bindings: EvaluationBindings = {},
  options: EvaluationOptions = {},
): number {
  return Evaluator.run(formula, bindings, { maxIterations: maxIterationsOption(options) });
}
