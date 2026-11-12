/**
 * Ruby: `Plurimath::Math::Evaluation::Result` (`result.rb`) and `Accuracy`
 * (`accuracy.rb`) — what one evaluation returns: the value, every accuracy
 * boundary the evaluator met, in order, and the formula left unevaluated when
 * strict mode stopped at one.
 *
 * Values keep the Ruby class they have (an `EvaluationValue`): an Integer is
 * a `bigint`, a Rational a reduced `bigint` pair, a Float a `number`, and a
 * BigDecimal its own `#to_s` string, which is exact. `inspectEvaluationValue`
 * gives Ruby's `#inspect` of any of them.
 */

import type { FormulaNode } from "../core/nodes";
import * as Decimal from "./big-decimal";
import type { RubyNumeric } from "./numeric";

/** A value with the Ruby class it has. */
export type EvaluationValue =
  | { readonly kind: "integer"; readonly value: bigint }
  | { readonly kind: "rational"; readonly numerator: bigint; readonly denominator: bigint }
  | { readonly kind: "float"; readonly value: number }
  /** A BigDecimal: `value` is its `#to_s` (`0.84147098480789650665e0`), `precision` its `#precision`. */
  | { readonly kind: "decimal"; readonly value: string; readonly precision: number };

/** A boundary operand: a value, or the raw text of a number literal (`"0.1"`). */
export type EvaluationOperand =
  | EvaluationValue
  | { readonly kind: "literal"; readonly text: string };

/**
 * What the evaluator did at a boundary: `approximated` (crossed, a Float
 * computed), `guarded` (crossed, a BigDecimal computed to the declared guard
 * digits) or `deferred` (refused, strict mode).
 */
export type BoundaryAction = "approximated" | "guarded" | "deferred";

/**
 * Ruby: one `Result#boundaries` record, `{ operation:, operands:,
 * operand_accuracy:, action:, result: }`. `operandAccuracy` is Ruby's
 * symbol as a string: `exact`, `limited_float`, or `limited_<n>` for a
 * BigDecimal of precision `n`.
 */
export interface EvaluationBoundary {
  readonly operation: string;
  readonly operands: readonly EvaluationOperand[];
  readonly operandAccuracy: string;
  readonly action: BoundaryAction;
  readonly result: EvaluationValue | null;
}

/**
 * Ruby: `Evaluation::Result`. `value` is `null` when strict mode deferred;
 * `unevaluated` then holds the formula itself, which the gem returns as its
 * AsciiMath (`formula.to_asciimath`) — rendering it is left to the caller
 * here, since evaluation imports no format (ARCHITECTURE.md §3, rule 6).
 */
export interface EvaluationResult {
  readonly value: EvaluationValue | null;
  readonly boundaries: readonly EvaluationBoundary[];
  readonly unevaluated: readonly FormulaNode[];
}

/** The public form of an internal value. */
export function toEvaluationValue(value: RubyNumeric): EvaluationValue {
  switch (value.kind) {
    case "integer":
      return { kind: "integer", value: value.value };
    case "rational":
      return { kind: "rational", numerator: value.num, denominator: value.den };
    case "float":
      return { kind: "float", value: value.value };
    case "decimal":
      return {
        kind: "decimal",
        value: Decimal.inspect(value),
        precision: Decimal.precision(value),
      };
  }
}

/**
 * Ruby: `Accuracy.of(value)` — `exact` for an Integer or Rational,
 * `limited_float` for a Float, `limited_<precision>` for a BigDecimal.
 */
export function accuracyOf(value: RubyNumeric): string {
  switch (value.kind) {
    case "integer":
    case "rational":
      return "exact";
    case "float":
      return "limited_float";
    case "decimal":
      return `limited_${Decimal.precision(value)}`;
  }
}

function accuracyRank(label: string): number {
  if (label === "exact") return Number.POSITIVE_INFINITY;
  if (label === "limited_float") return Number.NEGATIVE_INFINITY;
  return Number(label.slice("limited_".length));
}

/**
 * Ruby: `Accuracy.combine(*values)` — exact operands cannot improve a
 * limited result. Float limitations dominate; otherwise the least declared
 * decimal precision wins. Keep the first of equal ranks.
 */
export function combineAccuracy(values: readonly RubyNumeric[]): string {
  let best: string | null = null;
  for (const value of values) {
    const label = accuracyOf(value);
    if (best === null || accuracyRank(label) < accuracyRank(best)) best = label;
  }
  return best as string;
}

/**
 * Ruby's `Float#to_s` (`flo_to_s`): the shortest digits that round-trip, in
 * fixed notation when the decimal point falls within the first 16 digits
 * (`1234567890123456.8`), or the value is a whole number below 10^15
 * (`100000000000000.0`), or it is at least `0.0001`; otherwise as
 * `d.ddde+XX` with at least two exponent digits (measured: `1.0e+15`,
 * `1.234567890123456e+15`, `1.0e-05`).
 */
export function inspectFloat(value: number): string {
  if (Number.isNaN(value)) return "NaN";
  if (value === Infinity) return "Infinity";
  if (value === -Infinity) return "-Infinity";
  if (value === 0) return Object.is(value, -0) ? "-0.0" : "0.0";
  const sign = value < 0 ? "-" : "";
  const [mantissa, exp] = Math.abs(value).toExponential().split("e") as [string, string];
  const digits = mantissa.replace(".", "");
  const decpt = Number(exp) + 1;
  if (decpt > 0 && decpt <= 16 && decpt < digits.length) {
    return `${sign}${digits.slice(0, decpt)}.${digits.slice(decpt)}`;
  }
  if (decpt > 0 && decpt <= 15) return `${sign}${digits}${"0".repeat(decpt - digits.length)}.0`;
  if (decpt <= 0 && decpt > -4) return `${sign}0.${"0".repeat(-decpt)}${digits}`;
  const e = decpt - 1;
  const magnitude = String(Math.abs(e)).padStart(2, "0");
  return `${sign}${digits[0]}.${digits.length > 1 ? digits.slice(1) : "0"}e${e < 0 ? "-" : "+"}${magnitude}`;
}

/** Ruby's `#inspect` of a value, a literal's `String`, or `nil`. */
export function inspectEvaluationValue(value: EvaluationOperand | null): string {
  if (value === null) return "nil";
  switch (value.kind) {
    case "integer":
      return value.value.toString();
    case "rational":
      return `(${value.numerator}/${value.denominator})`;
    case "float":
      return inspectFloat(value.value);
    case "decimal":
      return value.value;
    case "literal":
      return JSON.stringify(value.text);
  }
}
