/**
 * Ruby: `Plurimath::Math::Evaluation::Evaluator` (`evaluator.rb`).
 *
 * Computes the numeric value of a `FormulaNode` tree against variable
 * bindings, enforcing the same strict contract as the gem: a result is
 * always a real, finite `number`, or one of the `Errors::Evaluation::*`
 * classes is thrown.
 *
 * Where the gem dispatches through Ruby polymorphism (`node.evaluate(self)`,
 * one method per class), this port's nodes are plain data (ARCHITECTURE.md
 * §5) — `dispatch` below is the single `switch (node.kind)` that stands in
 * for it, one branch per node kind this slice supports. Every other kind
 * falls through to the same place `Core#evaluate`'s default lands in the gem:
 * `unsupported`.
 */

import { type FormulaNode, type MathNode, NODE_KINDS, type NodeParameter } from "../core/nodes";
import { type EvaluationBindings, type NormalizedBindings, normalizeBindings } from "./bindings";
import {
  DivisionByZeroError,
  MathDomainError,
  MissingVariableError,
  NonFiniteResultError,
  UnsupportedExpressionError,
} from "./errors";
import { ExpressionParser } from "./expression-parser";
import { reservedConstant, type SymbolData, variableName } from "./operators";

/**
 * The `number`-kind slice of `MathNode` (ARCHITECTURE.md §5's data type, not
 * the `NumberNode` class) — a `switch (node.kind)` narrows to this, never to
 * the class, which additionally carries `equals()` and a private brand no
 * plain object satisfies (`core/nodes.ts`'s `NodeData<T>`). `SymbolData` is
 * `operators.ts`'s, reused rather than redeclared. Only `evaluateFormula`/
 * `Evaluator.run`, at the public boundary a caller hands a real parsed
 * `FormulaNode` through, use the class type; every class instance already
 * satisfies `MathNode` structurally, so passing one in is never the direction
 * that fails.
 */
type NumberData = Extract<MathNode, { kind: "number" }>;

/**
 * `NodeParameter` also admits a bare string, an array, or a `NodeOptions`
 * object (`core/nodes.ts`) — none of them a `MathNode`. `kind` is the one
 * field every `MathNode` union member carries and `NodeOptions`
 * (`Readonly<Record<string, unknown>>`) does not exclude by its own type, so
 * this checks that the value the discriminant holds is one of `NODE_KINDS`
 * rather than merely present.
 */
function isMathNode(node: unknown): node is MathNode {
  return (
    typeof node === "object" &&
    node !== null &&
    !Array.isArray(node) &&
    "kind" in node &&
    typeof (node as { kind: unknown }).kind === "string" &&
    (NODE_KINDS as readonly string[]).includes((node as { kind: string }).kind)
  );
}

/**
 * Ruby: `Number#evaluate` (`number.rb`) — an integer-shaped literal parses as
 * an Integer, everything else as a Float; both collapse to the same JS
 * `number` here; see `evaluate.spec.ts`'s "Number#evaluate" measurements.
 * `Float()`'s strictness (rejects trailing garbage, hex, leading/trailing
 * whitespace `Float` itself tolerates in Ruby only via `String#to_f`) is
 * mirrored with an explicit pattern rather than JavaScript's looser `Number()`
 * coercion (`Number("")` is `0`, `Number(" 1 ")` is `1`, `Number("0x10")` is
 * `16` — none of which `Float(raw)` accepts).
 *
 * In practice this path is defensive: the AsciiMath grammar only ever
 * constructs a `NumberNode` whose `value` already matches one of these
 * patterns, so the throw below is unreached by any parsed input, exactly as
 * the gem's own `rescue ArgumentError` is unreached by any input its
 * `number` grammar rule accepts.
 */
const INTEGER_PATTERN = /^[+-]?\d+$/;
const FLOAT_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function evaluateNumber(node: NumberData): number {
  const raw = String(node.value ?? "");
  if (INTEGER_PATTERN.test(raw) || FLOAT_PATTERN.test(raw)) return Number(raw);
  throw new UnsupportedExpressionError(`number \`${raw}\``);
}

/**
 * Ruby: `Core#evaluate`'s default fallback message, `class_name.sub(...)` —
 * approximated here, not reproduced exactly, for node kinds this slice never
 * had reason to resolve against the gem's own class names (message text is
 * never API, `core/errors.ts`'s header). `binaryFunction`/`unaryFunction`/
 * `ternaryFunction` carry their Ruby class basename in `name`
 * (`core/nodes.ts`), which is the one case worth being precise about: it is
 * what distinguishes `Function::Mod` (measured, `evaluate.spec.ts`) from
 * every other deferred binary function sharing this fallback.
 */
function describeUnsupportedNode(node: MathNode): string {
  switch (node.kind) {
    case "number":
      return `number \`${node.value}\``;
    case "symbol":
      return node.id === "Symbol" && node.value
        ? `symbol \`${node.value}\``
        : `Symbols::${node.id}`;
    case "binaryFunction":
    case "unaryFunction":
    case "ternaryFunction":
      return `Function::${node.name}`;
    default:
      return node.kind;
  }
}

/**
 * Ruby: `Array(nodes)` — `Fenced#parameter_two` (this port's
 * `FencedNode.parameterTwo`) is always an array in every measured AsciiMath
 * parse, but its declared type, `NodeParameter`, is the same wide union every
 * node slot carries (`core/nodes.ts`). A bare string is kept as a one-token
 * sequence so the parser's own malformed-token check reports it, matching a
 * stray string surviving into a Ruby `Formula#value`; a `NodeOptions` object
 * has no arithmetic meaning here and is dropped to the empty sequence, which
 * evaluates as `UnsupportedExpressionError("empty expression")` — the same
 * refusal an actually-empty `Fenced` body gets.
 */
function toNodeArray(nodes: NodeParameter): readonly (MathNode | string)[] {
  if (nodes === null) return [];
  if (Array.isArray(nodes)) return nodes as readonly (MathNode | string)[];
  if (typeof nodes === "string") return [nodes];
  if (typeof nodes === "object" && "kind" in nodes) return [nodes as MathNode];
  return [];
}

export class Evaluator {
  private readonly bindings: NormalizedBindings;

  constructor(bindings: EvaluationBindings = {}) {
    this.bindings = normalizeBindings(bindings);
  }

  evaluateFormula(formula: FormulaNode | Extract<MathNode, { kind: "formula" }>): number {
    return this.realResult(new ExpressionParser(this, formula.value ?? []).parse());
  }

  /** Ruby: `Evaluator#evaluate_nodes` — a `Fenced` body, evaluated as its own formula. */
  evaluateNodes(nodes: NodeParameter): number {
    return this.realResult(new ExpressionParser(this, toNodeArray(nodes)).parse());
  }

  /**
   * Ruby: `Evaluator#evaluate_node`. `node` is typed `NodeParameter |
   * undefined` — every parameter slot a `binaryFunction`'s two operands come
   * from (`node.parameterOne`/`parameterTwo` in `dispatch`) — rather than the
   * narrower `MathNode | string`: the gem's own `Power`/`Frac#evaluate` never
   * checks the slot's shape before calling `evaluate_node` on it, trusting a
   * malformed one to fail inside; this is that same trust, made explicit
   * because the port's slot type is wider (`NodeParameter` also admits an
   * array or a `NodeOptions` object, neither reachable through the AsciiMath
   * grammar this slice covers).
   */
  evaluateNode(node: NodeParameter | undefined): number {
    if (node === undefined || node === null) this.unsupported("missing operand");
    if (!isMathNode(node)) this.unsupported("malformed token");
    if (node.kind === "formula") return this.evaluateFormula(node);
    return this.realResult(this.dispatch(node));
  }

  /** Ruby: `Evaluator#value_for`. */
  valueFor(name: string): number {
    const value = this.bindings.get(name);
    if (value === undefined) throw new MissingVariableError(name);
    return value;
  }

  /** Ruby: `Evaluator#divide`. */
  divide(dividend: number, divisor: number): number {
    if (divisor === 0) throw new DivisionByZeroError();
    return dividend / divisor;
  }

  /**
   * Ruby: `Evaluator#power`, calling `base**exponent` and rejecting a
   * non-real result. Ruby's `**` promotes a negative base with a non-integer
   * exponent to `Complex`, which `real_result` then rejects
   * (`(-1)**0.5` measured as `MathDomainError: "result is not a real
   * number"`); JavaScript's `**` has no complex numbers and computes `NaN`
   * for the same input, which is indistinguishable from a `NaN` PROPAGATING
   * through a real Float operand (Ruby: `Float::NAN ** 2` is `NaN`, still a
   * real Float, rejected only by the FINAL finite check as
   * `NonFiniteResultError` — measured, `evaluate.spec.ts`). The domain check
   * below is evaluated BEFORE computing the power, on the real-number rule
   * that actually distinguishes the two Ruby outcomes (negative base,
   * non-integer exponent), so a genuinely non-real result and a propagating
   * `NaN` land on the same errors the gem raises for each.
   *
   * `0 ** negative` also has a Ruby-specific detour: `Integer#**` raises
   * `ZeroDivisionError` directly for `0 ** -1` (measured), which the
   * evaluator's own `rescue ::ZeroDivisionError` turns into
   * `DivisionByZeroError` — mirrored explicitly here since JavaScript's `**`
   * would otherwise compute `Infinity`.
   */
  power(base: number, exponent: number): number {
    if (base === 0 && exponent < 0) throw new DivisionByZeroError();
    if (base < 0 && !Number.isInteger(exponent)) {
      throw new MathDomainError("result is not a real number");
    }
    return base ** exponent;
  }

  /**
   * Ruby: `Evaluator#real_result` — checks `value.real?`, which rejects a
   * `Complex` but ACCEPTS a real `Float::NAN` (measured: `Float::NAN.real?`
   * is `true`; `a+1` with `a: Float::NAN` raises `NonFiniteResultError`, from
   * the FINAL finite check below, never `MathDomainError`). JavaScript has no
   * `Complex`, so every `number` — `NaN` included — is already "real" by
   * construction; this is a passthrough, not a no-op stand-in for a check
   * this port cannot make. The one place a value is genuinely non-real
   * (a negative base to a non-integer power) is caught earlier, in `power()`,
   * on the actual mathematical rule that makes it so — BEFORE computing `**`,
   * so it does not depend on whether the computed value happens to be `NaN`
   * (which `power()` must also accept as a legitimate propagating operand,
   * e.g. `power(NaN, 2)`, itself real per the same Ruby rule).
   */
  private realResult(value: number): number {
    return value;
  }

  /** Ruby: `Evaluator#unsupported`. */
  unsupported(nodeOrMessage: MathNode | string): never {
    const detail =
      typeof nodeOrMessage === "string" ? nodeOrMessage : describeUnsupportedNode(nodeOrMessage);
    throw new UnsupportedExpressionError(detail);
  }

  private dispatch(node: MathNode): number {
    switch (node.kind) {
      case "number":
        return evaluateNumber(node);
      case "symbol":
        return this.evaluateSymbol(node);
      case "fenced":
        return this.evaluateNodes(node.parameterTwo);
      // `Frac` is its own top-level `kind` in this port, not a `name` on
      // `binaryFunction` — unlike the gem, where `Function::Frac < BinaryFunction`
      // (`core/nodes.ts`'s `FracNode`: it carries an `options` field the other
      // 14 aliased `BinaryFunction` subclasses do not, so it is not folded into
      // their shared carrier). Measured: AsciiMath's `/` always parses to a
      // `FracNode` (`parseAsciimath("6/3")`), never a loose divide-operator
      // token — `ExpressionParser`'s header has the rest of this finding.
      case "frac":
        return this.divide(
          this.evaluateNode(node.parameterOne),
          this.evaluateNode(node.parameterTwo),
        );
      case "binaryFunction":
        if (node.name === "Power") {
          return this.power(
            this.evaluateNode(node.parameterOne),
            this.evaluateNode(node.parameterTwo),
          );
        }
        return this.unsupported(node);
      default:
        return this.unsupported(node);
    }
  }

  /** Ruby: `Symbols::Symbol#evaluate`. */
  private evaluateSymbol(node: SymbolData): number {
    const constant = reservedConstant(node);
    if (constant !== null) return constant;
    const name = variableName(node);
    if (name === null) return this.unsupported(node);
    return this.valueFor(name);
  }

  /** Ruby: `Evaluator#evaluate` — the entry point `evaluate.ts` calls. */
  static run(formula: FormulaNode, bindings: EvaluationBindings = {}): number {
    const evaluator = new Evaluator(bindings);
    const result = evaluator.evaluateFormula(formula);
    if (!Number.isFinite(result)) throw new NonFiniteResultError();
    return result;
  }
}
