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
 * port's AsciiMath grammar never does that — `2^3`, `2^3^2` and `2^-1` all
 * carry `^` pre-resolved into a `BinaryFunctionNode` with `name: "Power"`
 * (`src/formats/asciimath/transform.ts`'s `newPower`), and `/` is always a
 * `FracNode`, evaluated structurally from `Evaluator`'s dispatch. The power
 * level is still ported here, one to one, so a hand-built formula carrying a
 * loose `^` evaluates as the gem evaluates it rather than being refused.
 *
 * Every value is a `RubyNumeric` (`numeric.ts`), so each operator applies
 * Ruby's Integer/Float promotion rule, not just JavaScript arithmetic.
 */

import type { MathNode, NodeSequence } from "../core/nodes";
import { UnsupportedExpressionError } from "./errors";
import { add, divide, multiply, negate, power, type RubyNumeric, subtract } from "./numeric";
import {
  isCloseParen,
  isDivideOperator,
  isMinusOperator,
  isMultiplyOperator,
  isOpenParen,
  isOperandStart,
  isPlusOperator,
  isPowerOperator,
} from "./operators";

/** The subset of `Evaluator` this parser calls back into. */
export interface ExpressionEvaluator {
  evaluateNode(node: MathNode | string | undefined | null): RubyNumeric;
  evaluateNegatedMod(node: MathNode): RubyNumeric;
  unsupported(nodeOrMessage: MathNode | string): never;
}

function isNode(node: MathNode | string | undefined): node is MathNode {
  return node !== undefined && typeof node !== "string";
}

/** Ruby: `current.is_a?(Function::Mod)`. */
function isMod(node: MathNode | string | undefined): boolean {
  return isNode(node) && node.kind === "binaryFunction" && node.name === "Mod";
}

/** Ruby: `current.is_a?(Function::Fenced)`. */
function isFenced(node: MathNode | string | undefined): boolean {
  return isNode(node) && node.kind === "fenced";
}

/**
 * The node kinds whose gem class is a `Function::UnaryFunction` subclass the
 * gem evaluates: the `unaryFunction` carrier (`Sin`, `Max`, ...) and the
 * classes this port models as their own kind. Every other `UnaryFunction`
 * subclass (`Bar`, `Vec`, ...) has no `#evaluate` of its own, so binding it to
 * its argument first (`next_argument?`) or not reaches the same
 * `unsupported(node)` refusal with the same class name, and it is left out.
 */
const UNARY_FUNCTION_KINDS: ReadonlySet<string> = new Set([
  "unaryFunction",
  "abs",
  "ceil",
  "floor",
  "sqrt",
  "text",
]);

type Predicate = (node: MathNode | string) => boolean;

export class ExpressionParser {
  private index = 0;

  constructor(
    private readonly evaluator: ExpressionEvaluator,
    private readonly tokens: NodeSequence,
  ) {}

  parse(): RubyNumeric {
    const result = this.parseAdditive();
    if (!this.eof()) this.evaluator.unsupported(this.current());
    return result;
  }

  private parseAdditive(): RubyNumeric {
    let result = this.parseMultiplicative();
    for (;;) {
      if (this.take(isPlusOperator)) result = add(result, this.parseMultiplicative());
      else if (this.take(isMinusOperator)) result = subtract(result, this.parseMultiplicative());
      else return result;
    }
  }

  private parseMultiplicative(): RubyNumeric {
    let result = this.parseUnary();
    for (;;) {
      if (this.take(isMultiplyOperator)) result = multiply(result, this.parseUnary());
      else if (this.take(isDivideOperator)) result = divide(result, this.parseUnary());
      else if (this.implicitMultiplication()) result = multiply(result, this.parsePower());
      else return result;
    }
  }

  private parseUnary(): RubyNumeric {
    if (this.take(isPlusOperator)) return this.parseUnary();
    if (this.take(isMinusOperator)) return this.negatedUnary();
    return this.parsePower();
  }

  /**
   * Ruby: `ExpressionParser#negated_unary` — unary minus binds tighter than
   * `mod`, so `-7 mod 3` negates the dividend: `(-7) mod 3` is `2`, not
   * `-(7 mod 3)`.
   */
  private negatedUnary(): RubyNumeric {
    if (!this.eof() && isMod(this.current())) {
      return this.evaluator.evaluateNegatedMod(this.nextToken() as MathNode);
    }
    return negate(this.parseUnary());
  }

  /** Ruby: `ExpressionParser#parse_power` — a loose `^` chain, left to right. */
  private parsePower(): RubyNumeric {
    let result = this.parseOperand();
    while (this.take(isPowerOperator)) result = power(result, this.parseExponent());
    return result;
  }

  /** Ruby: `ExpressionParser#parse_exponent` — an exponent may carry its own signs. */
  private parseExponent(): RubyNumeric {
    if (this.take(isPlusOperator)) return this.parseExponent();
    if (this.take(isMinusOperator)) return this.negatedExponent();
    return this.parseOperand();
  }

  /** Ruby: `ExpressionParser#negated_exponent` — `negatedUnary`'s rule, in exponent position. */
  private negatedExponent(): RubyNumeric {
    if (!this.eof() && isMod(this.current())) {
      return this.evaluator.evaluateNegatedMod(this.nextToken() as MathNode);
    }
    return negate(this.parseExponent());
  }

  /**
   * Ruby: `ExpressionParser#parse_operand`. A unary function parsed apart
   * from its argument (`parameter_one` empty, a `Fenced` group next) is bound
   * to that group first (`next_argument?`/`bind_argument`); an n-ary
   * `Sum`/`Prod` with both bounds but no body adopts the next operand as its
   * body (`nary_body?`/`bind_nary_body`). The gem's third case,
   * `log_argument?` (a `Log` followed by a `Fenced` group), is not ported:
   * `Log` itself is not, and `evaluateNode` refuses it as unported whether or
   * not the group is bound to it first.
   */
  private parseOperand(): RubyNumeric {
    if (this.eof()) this.evaluator.unsupported("empty expression");
    if (isOpenParen(this.current())) return this.parseGroup();
    let node = this.nextToken();
    if (this.nextArgument(node)) {
      return this.evaluator.evaluateNode({
        ...(node as MathNode),
        parameterOne: this.nextToken(),
      } as MathNode);
    }
    if (this.naryBody(node)) node = this.bindNaryBody(node as MathNode);
    return this.evaluator.evaluateNode(node);
  }

  /** Ruby: `ExpressionParser#next_argument?`. */
  private nextArgument(node: MathNode | string): boolean {
    return (
      isNode(node) &&
      UNARY_FUNCTION_KINDS.has(node.kind) &&
      (node as { parameterOne?: unknown }).parameterOne == null &&
      !this.eof() &&
      isFenced(this.current())
    );
  }

  /** Ruby: `ExpressionParser#nary_body?`. */
  private naryBody(node: MathNode | string): boolean {
    if (!isNode(node) || (node.kind !== "sum" && node.kind !== "prod")) return false;
    return (
      node.parameterThree == null &&
      node.parameterOne != null &&
      node.parameterTwo != null &&
      !this.eof() &&
      isOperandStart(this.current())
    );
  }

  /**
   * Ruby: `ExpressionParser#bind_nary_body` — the body is the single next
   * operand, itself completed first when it is another bodiless `Sum`/`Prod`
   * (nested `sum sum ...`).
   */
  private bindNaryBody(node: MathNode): MathNode {
    let body = this.nextToken();
    if (this.naryBody(body)) body = this.bindNaryBody(body as MathNode);
    return { ...node, parameterThree: body } as MathNode;
  }

  /**
   * Ruby: `ExpressionParser#parse_group` — a loose open paren groups up to
   * the next close paren. A token other than a close paren is reported as
   * itself; "unmatched parenthesis" is reserved for the end of input.
   */
  private parseGroup(): RubyNumeric {
    this.advance();
    const result = this.parseAdditive();
    if (this.eof()) this.evaluator.unsupported("unmatched parenthesis");
    if (!isCloseParen(this.current())) this.evaluator.unsupported(this.current());
    this.advance();
    return result;
  }

  /**
   * Ruby: `ExpressionParser#implicit_multiplication?` — adjacent operands
   * multiply by juxtaposition (`2a`, `2(a+b)`), except two adjacent numeric
   * literals, which usually indicate a split number literal (`2 3` raises
   * `UnsupportedExpressionError`, not `6`; measured against the oracle).
   * A power operator is an operator, so it never starts an implicit
   * multiplicand (`isOperandStart`); `parsePower` consumes it instead.
   */
  private implicitMultiplication(): boolean {
    if (this.eof()) return false;
    if (!isOperandStart(this.current())) return false;
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
