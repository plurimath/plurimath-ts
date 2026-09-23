/**
 * Ruby: `Plurimath::Math::Evaluation::ExpressionParser` (`expression_parser.rb`).
 *
 * Resolves operator precedence over the flat token sequence a `Formula`
 * carries in `value`, delegating every operand's own evaluation back to the
 * `Evaluator`. Recursive-descent, tightest-last:
 * `additive -> multiplicative -> unary -> operand`.
 *
 * The gem's ladder has a fifth level, `parse_power`/`parse_exponent`, for a
 * loose `^` token — reachable when a format hands the evaluator a flat
 * `Symbols::Hat` rather than a structural `Function::Power`. Measured: this
 * port's AsciiMath grammar never does that. `2^3`, `2^3^2` and `2^-1` (as
 * `Formula([Power(2, Minus)], [1])`, itself an `UnsupportedExpressionError`
 * on both the gem and this port — see `evaluate.spec.ts`) all carry `^`
 * pre-resolved into a `BinaryFunctionNode` with `name: "Power"` before this
 * parser ever runs (`src/formats/asciimath/transform.ts`'s `newPower`), and
 * likewise `/` is always a `FracNode`, never a loose divide token. Both are
 * evaluated structurally instead, from `Evaluator.evaluateNode`'s dispatch —
 * the one-to-one equivalents of `Function::Power#evaluate` and
 * `Function::Frac#evaluate`. This ladder therefore implements only the levels
 * AsciiMath's grammar can still hand it as flat tokens: additive `+`/`-`,
 * multiplicative `*`/implicit multiplication, and unary `+`/`-`. Omitting the
 * dead power level is a deliberate, measured simplification, not a scope cut
 * — `^` is fully covered, just one layer up.
 */

import type { MathNode, NodeSequence } from "../core/nodes";
import { UnsupportedExpressionError } from "./errors";
import {
  isDivideOperator,
  isMinusOperator,
  isMultiplyOperator,
  isOperandStart,
  isPlusOperator,
  isPowerOperator,
} from "./operators";

/** The subset of `Evaluator` this parser calls back into. */
export interface ExpressionEvaluator {
  evaluateNode(node: MathNode | string | undefined | null): number;
  divide(dividend: number, divisor: number): number;
  unsupported(nodeOrMessage: MathNode | string): never;
}

type Predicate = (node: MathNode | string) => boolean;

export class ExpressionParser {
  private index = 0;

  constructor(
    private readonly evaluator: ExpressionEvaluator,
    private readonly tokens: NodeSequence,
  ) {}

  parse(): number {
    const result = this.parseAdditive();
    if (!this.eof()) this.evaluator.unsupported(this.current());
    return result;
  }

  private parseAdditive(): number {
    let result = this.parseMultiplicative();
    for (;;) {
      if (this.take(isPlusOperator)) result += this.parseMultiplicative();
      else if (this.take(isMinusOperator)) result -= this.parseMultiplicative();
      else return result;
    }
  }

  private parseMultiplicative(): number {
    let result = this.parseUnary();
    for (;;) {
      if (this.take(isMultiplyOperator)) result *= this.parseUnary();
      else if (this.take(isDivideOperator))
        result = this.evaluator.divide(result, this.parseUnary());
      else if (this.implicitMultiplication()) result *= this.parseUnary();
      else return result;
    }
  }

  private parseUnary(): number {
    if (this.take(isPlusOperator)) return this.parseUnary();
    if (this.take(isMinusOperator)) return -this.parseUnary();
    return this.parseOperand();
  }

  private parseOperand(): number {
    if (this.eof()) this.evaluator.unsupported("empty expression");
    return this.evaluator.evaluateNode(this.nextToken());
  }

  /**
   * Ruby: `ExpressionParser#implicit_multiplication?` — adjacent operands
   * multiply by juxtaposition (`2a`, `2(a+b)`), except two adjacent numeric
   * literals, which usually indicate a split number literal (`2 3` raises
   * `UnsupportedExpressionError`, not `6`; measured against the oracle).
   * `isPowerOperator` is checked too, unlike the gem's `operand_start?`: this
   * ladder never reaches a loose `^` token (see the class header), but a
   * hand-built tree could still carry one, and treating it as an implicit
   * multiplicand rather than falling through to `unsupported` would be a
   * silent divergence this port has no way to measure against the gem.
   */
  private implicitMultiplication(): boolean {
    if (this.eof()) return false;
    if (!isOperandStart(this.current())) return false;
    if (isPowerOperator(this.current())) return false;
    const current = this.current();
    const previous = this.tokens[this.index - 1];
    const bothNumbers =
      typeof current !== "string" &&
      current.kind === "number" &&
      previous !== undefined &&
      typeof previous !== "string" &&
      previous.kind === "number";
    return !bothNumbers;
  }

  private take(predicate: Predicate): boolean {
    if (this.eof() || !predicate(this.current())) return false;
    this.advance();
    return true;
  }

  private nextToken(): MathNode | string {
    const token = this.current();
    this.advance();
    return token;
  }

  /**
   * Ruby: `ExpressionParser#current` — validates on every read, not only when
   * a malformed token would otherwise reach an operand. `Formula#value`'s
   * declared element type, `MathNode | string` (`core/nodes.ts`'s
   * `NodeSequence`), admits a raw string no arithmetic formula produces; this
   * is that check.
   */
  private current(): MathNode | string {
    const token = this.tokens[this.index];
    if (token === undefined) throw new UnsupportedExpressionError("malformed token");
    return token;
  }

  private advance(): void {
    this.index += 1;
  }

  private eof(): boolean {
    return this.index >= this.tokens.length;
  }
}
