/**
 * `Plurimath::Errors::Evaluation::*` — eight classes, one to one with the gem
 * (`lib/plurimath/errors/evaluation/*.rb`, pinned oracle `00c52783`, v0.11.6).
 *
 * **SETTLED 2026-09-23** (the user): mirror the gem's error family rather than
 * collapsing it into one evaluation error type. `TODO.plan/open-decisions.md`
 * records the decision; `TODO.plan/deferred.md` parks the single-error-type
 * preference for later, changed in both the gem and the port together.
 *
 * Each class extends `core`'s `PlurimathError` — the same `code`-not-
 * `instanceof` contract as every other error family (`core/errors.ts`'s
 * header), which this leaf module can do because §3 rule 6 lets `evaluation`
 * import `core`. Unlike `formatting/errors.ts` (which imports nothing
 * internal and so cannot extend it), evaluation's module map says "imports
 * core", so there is no reason to duplicate the shape instead of using it.
 *
 * Message text mirrors the gem's interpolation byte-for-byte where it
 * interpolates a name, value or class — verified against the oracle in
 * `scripts/generate-evaluation-fixtures.rb`'s output. `EvaluationError`
 * itself is never raised directly by this module (nor, in practice, by the
 * gem: `Errors::Evaluation::Error` is `Plurimath::Error`'s ancestor for the
 * other seven, not a raised class on its own path) — it exists because the
 * gem defines it, and "eight separate classes" means eight, not seven plus
 * an implicit base.
 */

import { PlurimathError } from "../core/errors";

/** Ruby: `Plurimath::Errors::Evaluation::Error` and its seven subclasses. */
export type EvaluationErrorCode =
  | "EVAL_ERROR"
  | "EVAL_DIVISION_BY_ZERO"
  | "EVAL_MATH_DOMAIN"
  | "EVAL_NON_FINITE_RESULT"
  | "EVAL_UNSUPPORTED_EXPRESSION"
  | "EVAL_MISSING_VARIABLE"
  | "EVAL_INVALID_BINDING"
  | "EVAL_INVALID_BINDING_KEY";

/** Ruby: `Plurimath::Errors::Evaluation::Error < Plurimath::Error`. */
export class EvaluationError extends PlurimathError {
  readonly code: EvaluationErrorCode = "EVAL_ERROR";

  /**
   * Not useless despite forwarding unchanged: `PlurimathError`'s constructor
   * is `protected`, so omitting this one would make TypeScript infer the
   * same protected constructor here too, and `MathDomainError` below, which
   * in turn omits its own, would inherit `protected` and stop being publicly
   * constructible. Declaring it, unchanged, is what re-opens it to `public`.
   */
  // biome-ignore lint/complexity/noUselessConstructor: see the comment above.
  constructor(message: string) {
    super(message);
  }
}

/**
 * Ruby: `Plurimath::Errors::Evaluation::DivisionByZeroError#initialize`
 * (`division_by_zero_error.rb`) — no arguments, fixed message.
 */
export class DivisionByZeroError extends EvaluationError {
  override readonly code: EvaluationErrorCode = "EVAL_DIVISION_BY_ZERO";

  constructor() {
    super("divided by 0");
  }
}

/**
 * Ruby: `MathDomainError < Error` (`math_domain_error.rb`) adds no
 * `#initialize` of its own — it is raised both with the wrapped
 * `::Math::DomainError#message` (from `evaluator.rb`'s `rescue`) and with a
 * literal message (`real_result`'s "result is not a real number"), so the
 * message stays a required constructor argument here rather than fixed —
 * inherited unchanged from `EvaluationError`, which already declares the same
 * public `(message: string)` constructor, so restating it here would only
 * forward it, which is the useless case `EvaluationError`'s own comment is not.
 */
export class MathDomainError extends EvaluationError {
  override readonly code: EvaluationErrorCode = "EVAL_MATH_DOMAIN";
}

/** Ruby: `NonFiniteResultError#initialize` (`non_finite_result_error.rb`). */
export class NonFiniteResultError extends EvaluationError {
  override readonly code: EvaluationErrorCode = "EVAL_NON_FINITE_RESULT";

  constructor() {
    super("result is not a finite number");
  }
}

/**
 * Ruby: `UnsupportedExpressionError#initialize` (`unsupported_expression_error.rb`).
 * `message` is the gem's `unsupported_message` result — a stable phrase such
 * as `"number \`3.x\`"` or a class name, never the raw node.
 */
export class UnsupportedExpressionError extends EvaluationError {
  override readonly code: EvaluationErrorCode = "EVAL_UNSUPPORTED_EXPRESSION";

  constructor(readonly detail: string) {
    super(`unsupported expression: ${detail}`);
  }
}

/**
 * Ruby: `MissingVariableError#initialize` (`missing_variable_error.rb`).
 * Field named `variableName`, not `name`: `Error.prototype.name` is already
 * the class-name field every error in this codebase sets through
 * `PlurimathError`'s constructor (`new.target.name`), and reusing it for the
 * variable would silently overwrite that convention rather than extend it.
 */
export class MissingVariableError extends EvaluationError {
  override readonly code: EvaluationErrorCode = "EVAL_MISSING_VARIABLE";

  constructor(readonly variableName: string) {
    super(`missing value for variable \`${variableName}\``);
  }
}

/**
 * Ruby: `InvalidBindingError#initialize(name, value)` (`invalid_binding_error.rb`)
 * interpolates `value.class` — a Ruby class name (`String`, `NilClass`,
 * `TrueClass`, `Complex`...). JavaScript has no equivalent class hierarchy for
 * a bare value, so `valueType` carries the nearest JS-native label
 * (`typeof value`, with `"null"` and `"array"` singled out because
 * `typeof null === "object"` and `typeof [] === "object"` would otherwise
 * collide with a plain object) — see `describeBindingValueType` in
 * `bindings.ts`, the single place this label is computed. Field named
 * `variableName`, not `name`, for the same reason as `MissingVariableError`'s.
 */
export class InvalidBindingError extends EvaluationError {
  override readonly code: EvaluationErrorCode = "EVAL_INVALID_BINDING";

  constructor(
    readonly variableName: string,
    readonly valueType: string,
  ) {
    super(
      `wrong value for variable \`${variableName}\` (given ${valueType}, expected a real number)`,
    );
  }
}

/**
 * Ruby: `InvalidBindingKeyError#initialize(key)` (`invalid_binding_key_error.rb`)
 * interpolates `key.class` for a key that is neither a `String` nor a
 * `Symbol`. This port's public bindings type is a plain JS object
 * (`Readonly<Record<string, number>>`, `bindings.ts`) — every JS object key
 * is already a string, which is why the gem's Symbol-or-String duality
 * collapses to "always valid" on this port's typed surface and this error is
 * UNREACHABLE through it. It is still defined, one to one with the gem, per
 * the settled decision above; `keyType` is included for parity and is never
 * produced by `evaluate()` itself in this slice.
 */
export class InvalidBindingKeyError extends EvaluationError {
  override readonly code: EvaluationErrorCode = "EVAL_INVALID_BINDING_KEY";

  constructor(readonly keyType: string) {
    super(`wrong type for binding key (given ${keyType}, expected String or Symbol)`);
  }
}
