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
 * where glibc's answer is not reliably the correctly rounded one), `Lg`
 * (glibc's `log10`, `libm-log10.ts`) and `Log` with its base and exponent
 * (glibc's `log2`, `libm-log2.ts`), and `Sinh`, `Cosh`, `Tanh`, `Sech`,
 * `Csch` and `Coth` (`libm-hyperbolic.ts`: glibc's `sinh`, `cosh` and `tanh`
 * from fdlibm, on an `expm1` that gives glibc's digits, refused only where
 * `sinh`/`cosh` call `exp` inside `exp`'s band; `TODO.plan/deferred.md` has
 * the regions). A refusal raises `core`'s `UnsupportedFeatureError`
 * (feature `"evaluate"`): a port gap, not an answer about the expression.
 * `UnsupportedExpressionError` is kept for exactly the refusals the gem
 * itself makes — a malformed number, a missing operand, a stray operator or
 * token, and a node class with no `#evaluate` of its own —
 * `TODO.plan/feature-roadmap.md`'s evaluation entry has the rest of the plan.
 *
 * `options` stands in for the gem's keyword arguments (`mode:`,
 * `guard_digits:`) and for the one evaluation setting it reads from global
 * configuration: `EvaluationOptions` below.
 *
 * **Accuracy-aware evaluation** (plurimath 0.11.13+): the gem's
 * `Formula#evaluate` returns an `Evaluation::Result` — the value, every
 * accuracy boundary crossed or deferred, and the formula left unevaluated —
 * and `evaluateResult` returns the same (`result.ts`). `mode: "strict"`
 * keeps exact values exact (decimal literals and division as Rationals) and
 * stops at the first inexact operation; with `guardDigits` it computes the
 * BigMath functions as BigDecimals to that many digits instead
 * (`big-decimal.ts`, `big-math.ts`). `evaluate` keeps returning a `number`,
 * and refuses where the value is not one.
 */

import { UnsupportedFeatureError } from "../core/errors";
import type { FormulaNode } from "../core/nodes";
import { isStackOverflow } from "../core/stack-overflow";
import type { EvaluationBindings } from "./bindings";
import {
  DEFAULT_MAX_ITERATIONS,
  type EvaluationMode,
  Evaluator,
  type EvaluatorSettings,
} from "./evaluator";
import type { EvaluationResult } from "./result";

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
export type { EvaluationMode } from "./evaluator";
export {
  type BoundaryAction,
  type EvaluationBoundary,
  type EvaluationOperand,
  type EvaluationResult,
  type EvaluationValue,
  inspectEvaluationValue,
} from "./result";

/** Per-call evaluation settings. */
export interface EvaluationOptions {
  /**
   * Ruby: `Plurimath.configuration.evaluation_max_iterations` — the most
   * steps one `Sum`/`Prod` may take (`to - from + 1`); a larger range raises
   * `UnsupportedExpressionError` ("iteration range larger than N steps")
   * before any step runs. Defaults to the gem's `100_000`
   * (`configuration.rb`); `null` disables the cap, as `nil` does in the gem.
   *
   * **Availability caveat:** without a cap, `evaluate()` runs one body
   * evaluation per step, synchronously on the calling thread, so its time is
   * linear in the range and has no bound — as with the gem's `nil`. An
   * untrusted formula can then block the caller for as long as its range
   * is large. Keep a cap when the formula comes from outside.
   * `scripts/measure-uncapped-iteration.mjs` times uncapped sums on the
   * current host; its figures depend on the machine and its load.
   */
  readonly evaluationMaxIterations?: number | null | undefined;
  /**
   * Ruby: `Formula#evaluate(mode:)` — `"approximate"` (the default) crosses
   * every accuracy boundary and records each crossing; `"strict"` never
   * crosses one: the first defers the evaluation (`evaluateResult`'s `value`
   * is `null`).
   */
  readonly mode?: EvaluationMode | undefined;
  /**
   * Ruby: `Formula#evaluate(guard_digits:)` — with `mode: "strict"`, the
   * digits a `sin`, `cos`, `exp`, `ln`/`log`, `lg`, `sqrt` or `arctan`
   * boundary is computed to, as a BigDecimal. Ignored in approximate mode, as
   * in the gem. A positive integer; the work grows with it.
   */
  readonly guardDigits?: number | null | undefined;
}

/** Ruby: `Evaluator#initialize`'s argument checks, raised as `TypeError` here. */
function settingsFor(options: EvaluationOptions): EvaluatorSettings {
  const mode = options.mode ?? "approximate";
  if (mode !== "approximate" && mode !== "strict") {
    throw new TypeError("mode must be one of [:approximate, :strict]");
  }
  const guardDigits = options.guardDigits ?? null;
  if (guardDigits !== null && !(Number.isSafeInteger(guardDigits) && guardDigits > 0)) {
    throw new TypeError("guard_digits must be a positive Integer");
  }
  return { maxIterations: maxIterationsOption(options), mode, guardDigits };
}

function stackGuarded<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (isStackOverflow(error)) {
      throw new UnsupportedFeatureError(
        "evaluate",
        "the tree nests too deep for the evaluation call stack; the depth limit is runtime-dependent",
      );
    }
    throw error;
  }
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
 *   port has not ported; a final result JavaScript cannot represent exactly
 *   (a Rational, a BigDecimal, an unsafe Integer, or no value because strict
 *   mode deferred); a Float power or `Math` function result inside glibc's
 *   rounding band; a Ruby `ArgumentError`; or an exact intermediate beyond
 *   the port's size limit; or a tree deeper than the runtime's evaluation
 *   call stack.
 * @throws {TypeError} `options.evaluationMaxIterations` is neither a number
 *   nor `null`, `options.mode` is neither `"approximate"` nor `"strict"`, or
 *   `options.guardDigits` is not a positive integer.
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
  const settings = settingsFor(options);
  return stackGuarded(() => Evaluator.run(formula, bindings, settings));
}

/**
 * Ruby: `Formula#evaluate(bindings, mode:, guard_digits:)` — the whole
 * `Evaluation::Result`: the value with its Ruby class (an Integer or
 * Rational exactly, a Float, or a BigDecimal as its `#to_s`), or `null`
 * where strict mode deferred; every boundary, in order; and the formula left
 * unevaluated. The gem returns that formula as AsciiMath text; here it is
 * the `FormulaNode` itself (`toAsciimath` renders it).
 *
 * @throws {UnsupportedFeatureError} as `evaluate`, except that a Rational,
 *   BigDecimal or unsafe Integer value is returned rather than refused; and
 *   where Ruby raises `ArgumentError` from `BigDecimal()` (a guarded
 *   function of a Rational operand, `sin(1/2)`).
 * @throws {TypeError} an option the gem's `ArgumentError` would reject.
 * @throws {EvaluationError} one of the gem's own evaluation errors.
 */
export function evaluateResult(
  formula: FormulaNode,
  bindings: EvaluationBindings = {},
  options: EvaluationOptions = {},
): EvaluationResult {
  const settings = settingsFor(options);
  return stackGuarded(() => Evaluator.runResult(formula, bindings, settings));
}

export { evaluateRequest, formulaFromRequestAst } from "./request";
