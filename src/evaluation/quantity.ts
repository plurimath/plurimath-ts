/**
 * Unit-aware evaluation (R-C1): `evaluateQuantity(formula, { runtime })`.
 *
 * Opt-in and additive: `evaluate`/`evaluateResult` are unchanged. The same
 * `ExpressionParser` resolves precedence over the formula's token sequence;
 * every value it produces is a quantity from the caller-supplied UnitsML
 * quantity runtime (the `unitsml` package's exports), so each intermediate
 * carries its unit, dimension and scale. This module does no unit or numeric
 * arithmetic of its own: sums, differences, products, quotients, scaling,
 * literal construction and conversion are the runtime's `Quantity` methods,
 * whose values are exact rationals. The runtime is a parameter, not an
 * import, so the package gains no dependency (ARCHITECTURE.md §3, rule 6).
 *
 * Operands: number literals (exact), `"unitsml(...)"` nodes (a magnitude-1
 * quantity of that unit, parsed by the runtime), bound variables holding
 * runtime quantities, grouping parentheses, `+`, `-`, `*`, `/`, `FracNode`
 * and implicit multiplication. A number directly multiplying a bare unit
 * builds the quantity literal (`20 degC` is an absolute interval-scale
 * value, not 20 times 1 degC). Every other construct is refused with
 * `UnsupportedFeatureError` (feature `"evaluateQuantity"`); a runtime
 * refusal (`DimensionMismatchError`, `ScaleOperationError`,
 * `IndeterminateResultError`, `ConversionError`, `ParseError`) propagates
 * unchanged, typed by the runtime.
 */
import { UnsupportedFeatureError } from "../core/errors";
import type { FormulaNode, MathNode, NodeParameter, NodeSequence } from "../core/nodes";
import { InvalidBindingError, MissingVariableError, UnsupportedExpressionError } from "./errors";
import {
  describeUnsupportedNode,
  FLOAT_PATTERN,
  INTEGER_PATTERN,
  isMathNode,
  toNodeArray,
} from "./evaluator";
import {
  type ExpressionArithmetic,
  type ExpressionEvaluator,
  ExpressionParser,
} from "./expression-parser";
import { reservedConstant, type SymbolData, variableName } from "./operators";

/** The `unitsml` `Quantity` methods this evaluator delegates to. */
export interface UnitsmlQuantity<Q> {
  /** An exact rational; its `toString()` is re-read exactly by the runtime. */
  readonly value: { toString(): string };
  /** `undefined` for a pure number. */
  readonly formula: object | undefined;
  readonly scale: string;
  plus(other: Q): Q;
  minus(other: Q): Q;
  times(other: Q): Q;
  dividedBy(other: Q): Q;
  scaledBy(number: string): Q;
  convertToFormula(target: object): Q;
}

/** The `unitsml` package exports `evaluateQuantity` needs (pass the module namespace). */
export interface UnitsmlQuantityRuntime<Q extends UnitsmlQuantity<Q>> {
  // biome-ignore lint/style/useNamingConvention: the unitsml export is the class `Quantity`.
  readonly Quantity: new (
    value: string,
    formula?: object,
  ) => Q;
  /** AsciiUnits expression to UnitsML `Formula`. */
  parse(input: string): Promise<object>;
}

export interface QuantityEvaluationOptions<Q extends UnitsmlQuantity<Q>> {
  /** The UnitsML quantity runtime (e.g. `await import("unitsml")`). Required. */
  readonly runtime: UnitsmlQuantityRuntime<Q>;
  /** Variable values; each must be a quantity of `runtime`. */
  readonly bindings?: Readonly<Record<string, Q>> | undefined;
  /** An AsciiUnits unit the result is converted to, exactly, by the runtime. */
  readonly target?: string | undefined;
}

const FEATURE = "evaluateQuantity";

/**
 * Evaluate `formula` to a UnitsML quantity. Asynchronous only because the
 * runtime's unit parser is: every `"unitsml(...)"` text (and `target`) is
 * parsed first, then the tree is evaluated synchronously.
 *
 * @throws {TypeError} `options.runtime` is missing or not a quantity runtime.
 * @throws {UnsupportedFeatureError} a construct with no unit-aware evaluation.
 * @throws {EvaluationError} `UnsupportedExpressionError`, `MissingVariableError`
 *   or `InvalidBindingError`.
 * @throws the runtime's own typed errors, unchanged.
 */
export async function evaluateQuantity<Q extends UnitsmlQuantity<Q>>(
  formula: FormulaNode,
  options: QuantityEvaluationOptions<Q>,
): Promise<Q> {
  const runtime = options?.runtime;
  if (typeof runtime?.Quantity !== "function" || typeof runtime.parse !== "function") {
    throw new TypeError("evaluateQuantity needs options.runtime: the unitsml quantity runtime");
  }
  const units = new Map<string, object>();
  for (const text of unitsmlTexts(formula)) units.set(text, await runtime.parse(text));
  const target = options.target === undefined ? undefined : await runtime.parse(options.target);
  const evaluator = new QuantityEvaluator(runtime, units, options.bindings ?? {});
  const result = evaluator.evaluateFormula(formula);
  return target === undefined ? result : result.convertToFormula(target);
}

/** Every distinct `unitsml` node text in the tree. */
function unitsmlTexts(root: unknown): Set<string> {
  const texts = new Set<string>();
  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    if (isMathNode(value) && value.kind === "unitsml") texts.add(value.text);
    for (const child of Object.values(value)) visit(child);
  };
  visit(root);
  return texts;
}

class QuantityEvaluator<Q extends UnitsmlQuantity<Q>> implements ExpressionEvaluator<Q> {
  /** Magnitude-1 quantities made from a `unitsml` node, not yet combined. */
  private readonly bareUnits = new WeakSet<object>();
  private readonly arithmetic: ExpressionArithmetic<Q>;

  constructor(
    private readonly runtime: UnitsmlQuantityRuntime<Q>,
    private readonly units: ReadonlyMap<string, object>,
    private readonly bindings: Readonly<Record<string, Q>>,
  ) {
    this.arithmetic = {
      add: (left, right) => left.plus(right),
      subtract: (left, right) => left.minus(right),
      multiply: (left, right) => this.multiply(left, right),
      negate: (value) => value.scaledBy("-1"),
    };
  }

  evaluateFormula(formula: FormulaNode | Extract<MathNode, { kind: "formula" }>): Q {
    return this.parseSequence(formula.value ?? []);
  }

  evaluateNode(node: NodeParameter | undefined): Q {
    if (node === undefined || node === null) this.unsupported("missing operand");
    if (!isMathNode(node)) this.unsupported("malformed token");
    switch (node.kind) {
      case "formula":
        return this.evaluateFormula(node);
      case "fenced":
        return this.parseSequence(node.parameterTwo);
      case "number":
        return this.numberValue(String(node.value ?? ""));
      case "unitsml":
        return this.unitValue(node.text);
      case "symbol":
        return this.symbolValue(node);
      case "frac":
        return this.divide(
          this.evaluateNode(node.parameterOne),
          this.evaluateNode(node.parameterTwo),
        );
      default:
        return this.refuse(node);
    }
  }

  divide(dividend: Q, divisor: Q): Q {
    return dividend.dividedBy(divisor);
  }

  power(): Q {
    throw new UnsupportedFeatureError(FEATURE, "a loose `^` power has no unit-aware evaluation");
  }

  evaluateNegatedMod(node: MathNode): Q {
    return this.refuse(node);
  }

  evaluateLogWithArgument(node: MathNode): Q {
    return this.refuse(node);
  }

  unsupported(nodeOrMessage: MathNode | string): never {
    const detail =
      typeof nodeOrMessage === "string" ? nodeOrMessage : describeUnsupportedNode(nodeOrMessage);
    throw new UnsupportedExpressionError(detail);
  }

  private parseSequence(nodes: NodeParameter | NodeSequence): Q {
    return new ExpressionParser<Q>(this, toNodeArray(nodes), this.arithmetic).parse();
  }

  /**
   * A number times a bare unit is the quantity literal, built by the
   * runtime's constructor (which derives the scale from unitsdb); a pure
   * number on either side otherwise scales (`Quantity#scaledBy`, refused on
   * absolute interval values); anything else is `Quantity#times`.
   */
  private multiply(left: Q, right: Q): Q {
    if (left.formula === undefined && this.bareUnits.has(right)) {
      return new this.runtime.Quantity(left.value.toString(), right.formula);
    }
    if (right.formula === undefined) return left.scaledBy(right.value.toString());
    if (left.formula === undefined) return right.scaledBy(left.value.toString());
    return left.times(right);
  }

  /** An integer or decimal literal as an exact runtime rational. */
  private numberValue(raw: string): Q {
    if (!INTEGER_PATTERN.test(raw) && !FLOAT_PATTERN.test(raw)) {
      throw new UnsupportedExpressionError(`number \`${raw}\``);
    }
    return new this.runtime.Quantity(raw);
  }

  private unitValue(text: string): Q {
    const formula = this.units.get(text);
    if (formula === undefined) return this.unsupported(`unitsml \`${text}\``);
    const quantity = new this.runtime.Quantity("1", formula);
    this.bareUnits.add(quantity);
    return quantity;
  }

  private symbolValue(node: SymbolData): Q {
    if (reservedConstant(node) !== null) {
      throw new UnsupportedFeatureError(FEATURE, "`pi` has no exact quantity value");
    }
    const name = variableName(node);
    if (name === null) return this.unsupported(node);
    if (!Object.hasOwn(this.bindings, name)) throw new MissingVariableError(name);
    const value: unknown = this.bindings[name];
    if (!(value instanceof this.runtime.Quantity)) {
      throw new InvalidBindingError(name, value === null ? "nil" : typeof value);
    }
    return value as Q;
  }

  private refuse(node: MathNode): never {
    throw new UnsupportedFeatureError(
      FEATURE,
      `${describeUnsupportedNode(node)} has no unit-aware evaluation`,
    );
  }
}
