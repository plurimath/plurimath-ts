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
 * lands in `unported`, which tells apart the two reasons a node is not
 * evaluated here: the gem evaluates it but this slice has not ported that yet
 * (`UnsupportedFeatureError`), or the gem itself refuses it through
 * `Core#evaluate`'s default (`UnsupportedExpressionError`, as the gem raises).
 *
 * Every intermediate value is a `RubyNumeric` (`numeric.ts`): the exact
 * Integer, Rational or Float the gem would hold, combined by Ruby's own
 * promotion rules. Only the final value is checked for an exact JS `number`.
 */

import { UnsupportedFeatureError } from "../core/errors";
import { type FormulaNode, type MathNode, NODE_KINDS, type NodeParameter } from "../core/nodes";
import { type EvaluationBindings, type NormalizedBindings, normalizeBindings } from "./bindings";
import { MissingVariableError, NonFiniteResultError, UnsupportedExpressionError } from "./errors";
import { ExpressionParser } from "./expression-parser";
import {
  divide,
  type FinalNumeric,
  finalResult,
  float,
  fromBinding,
  integer,
  power,
  type RubyNumeric,
} from "./numeric";
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
 * an Integer (`raw_value.to_i`, exact at any size), everything else as a
 * Float (`Float(raw)`).
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
// The fractional digits are allowed only after a literal dot, so every
// string has one way to match. The earlier `\d+\.?\d*` let both digit runs
// claim the same digits when no dot is present, and a long digit string that
// then failed (`"0".repeat(50000) + "x"`) backtracked quadratically: about 20
// s, against about 1 ms for this form. Both forms accept the same strings.
const FLOAT_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

function evaluateNumber(node: NumberData): RubyNumeric {
  const raw = String(node.value ?? "");
  if (INTEGER_PATTERN.test(raw)) return integer(BigInt(raw));
  if (FLOAT_PATTERN.test(raw)) return float(Number(raw));
  throw new UnsupportedExpressionError(`number \`${raw}\``);
}

/**
 * The gem classes whose `#evaluate` is their own rather than `Core`'s
 * refusing default — measured on the oracle by listing every
 * `Plurimath::Math` class for which `instance_method(:evaluate).owner` is not
 * `Core` (no subclass inherits one; `Symbols::*` subclasses all share
 * `Symbols::Symbol#evaluate`, handled by `evaluateSymbol`). A node of one of
 * these classes that this slice does not evaluate is a PORT gap,
 * `UnsupportedFeatureError`; any other class is refused by the gem itself,
 * which this port mirrors as `UnsupportedExpressionError`.
 *
 * The `binaryFunction`/`unaryFunction`/`ternaryFunction` carriers hold the
 * Ruby class basename in `name` (`core/nodes.ts`); the other kinds map to one
 * gem class each.
 */
export const GEM_EVALUATED_FUNCTIONS: ReadonlySet<string> = new Set([
  "Abs",
  "Arccos",
  "Arcsin",
  "Arctan",
  "Ceil",
  "Cos",
  "Cosh",
  "Cot",
  "Coth",
  "Csc",
  "Csch",
  "Exp",
  "Floor",
  "Gcd",
  "Lcm",
  "Lg",
  "Ln",
  "Log",
  "Max",
  "Min",
  "Mod",
  "Prod",
  "Root",
  "Sec",
  "Sech",
  "Sin",
  "Sinh",
  "Sqrt",
  "Sum",
  "Tan",
  "Tanh",
  "Text",
]);

/** Node kinds whose single gem class is in `GEM_EVALUATED_FUNCTIONS`. */
const GEM_EVALUATED_KINDS: ReadonlyMap<string, string> = new Map([
  ["abs", "Abs"],
  ["ceil", "Ceil"],
  ["floor", "Floor"],
  ["prod", "Prod"],
  ["sqrt", "Sqrt"],
  ["sum", "Sum"],
  ["text", "Text"],
]);

/** The gem class a node would be, when the gem evaluates that class; `null` otherwise. */
function gemEvaluatedClass(node: MathNode): string | null {
  switch (node.kind) {
    case "binaryFunction":
    case "unaryFunction":
    case "ternaryFunction":
      return GEM_EVALUATED_FUNCTIONS.has(node.name) ? node.name : null;
    default:
      return GEM_EVALUATED_KINDS.get(node.kind) ?? null;
  }
}

/**
 * Every remaining node `kind` this port models (`core/nodes.ts`'s
 * `NODE_KINDS`) to the Ruby class basename `Core#evaluate`'s fallback would
 * print — `node.class.name.sub(/^Plurimath::Math::/, "")` — for the bare
 * carrier of that kind (the ones `describeUnsupportedNode`'s `switch` does
 * not resolve some other way: `number`, `symbol`, `binaryFunction`,
 * `unaryFunction`, `ternaryFunction`, `fontStyle` and `table`, the last two
 * handled separately below because each also carries a `name` for its
 * aliased subclass, `core/nodes.ts`'s `FontStyleNode`/`TableNode`).
 *
 * Every entry is measured directly on the oracle (`Math::Function::<Basename>.
 * name.sub(...)`), not inferred from the module path — `mrow`'s gem class is
 * `Plurimath::Math::Formula::Mrow`, under `Formula`, not `Function`, the one
 * exception a naming-by-convention guess would have missed.
 */
const DEFAULT_UNSUPPORTED_CLASS: Readonly<Record<string, string>> = {
  abs: "Function::Abs",
  bar: "Function::Bar",
  base: "Function::Base",
  ceil: "Function::Ceil",
  color: "Function::Color",
  ddot: "Function::Ddot",
  dot: "Function::Dot",
  fenced: "Function::Fenced",
  floor: "Function::Floor",
  formula: "Formula",
  frac: "Function::Frac",
  hat: "Function::Hat",
  int: "Function::Int",
  linebreak: "Function::Linebreak",
  mpadded: "Function::Mpadded",
  mrow: "Formula::Mrow",
  nary: "Function::Nary",
  norm: "Function::Norm",
  obrace: "Function::Obrace",
  oint: "Function::Oint",
  overleftrightarrow: "Function::Overleftrightarrow",
  overset: "Function::Overset",
  prod: "Function::Prod",
  sqrt: "Function::Sqrt",
  sum: "Function::Sum",
  text: "Function::Text",
  tilde: "Function::Tilde",
  ubrace: "Function::Ubrace",
  ul: "Function::Ul",
  underset: "Function::Underset",
  vec: "Function::Vec",
};

/**
 * Ruby: `Core#evaluate`'s default fallback message, `class_name.sub(...)`.
 * `binaryFunction`/`unaryFunction`/`ternaryFunction` carry their Ruby class
 * basename in `name` (`core/nodes.ts`); `fontStyle`/`table` do too, but their
 * BARE carrier (no `name`) is itself a concrete gem class
 * (`Function::FontStyle`, `Function::Table`), unlike the three function
 * carriers, none of which the gem ever instantiates un-aliased — so a bare
 * `fontStyle`/`table` reports its own class, and only a named one reports the
 * aliased subclass (`DEFAULT_UNSUPPORTED_CLASS` has neither key: both are
 * resolved here, next to the `name` read that decides between them).
 * `Symbols::Equal` has its own phrase in the gem's `unsupported_message`
 * ("equation"; measured: `1=1`), reproduced here.
 */
function describeUnsupportedNode(node: MathNode): string {
  switch (node.kind) {
    case "number":
      return `number \`${node.value}\``;
    case "symbol":
      if (node.id === "Equal") return "equation";
      return node.id === "Symbol" && node.value
        ? `symbol \`${node.value}\``
        : `Symbols::${node.id}`;
    case "binaryFunction":
    case "unaryFunction":
    case "ternaryFunction":
      return `Function::${node.name}`;
    case "fontStyle":
      return node.name ? `Function::FontStyle::${node.name}` : "Function::FontStyle";
    case "table":
      return node.name ? `Function::Table::${node.name}` : "Function::Table";
    default:
      return DEFAULT_UNSUPPORTED_CLASS[node.kind] ?? node.kind;
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

  evaluateFormula(formula: FormulaNode | Extract<MathNode, { kind: "formula" }>): RubyNumeric {
    return this.realResult(new ExpressionParser(this, formula.value ?? []).parse());
  }

  /** Ruby: `Evaluator#evaluate_nodes` — a `Fenced` body, evaluated as its own formula. */
  evaluateNodes(nodes: NodeParameter): RubyNumeric {
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
  evaluateNode(node: NodeParameter | undefined): RubyNumeric {
    if (node === undefined || node === null) this.unsupported("missing operand");
    if (!isMathNode(node)) this.unsupported("malformed token");
    if (node.kind === "formula") return this.evaluateFormula(node);
    return this.realResult(this.dispatch(node));
  }

  /**
   * Ruby: `Evaluator#value_for`. The binding's Ruby kind is inferred from the
   * JS value (`numeric.ts`'s `fromBinding`: a safe integer is an Integer).
   */
  valueFor(name: string): RubyNumeric {
    const value = this.bindings.get(name);
    if (value === undefined) throw new MissingVariableError(name);
    return fromBinding(value);
  }

  /**
   * Ruby: `Evaluator#real_result` — checks `value.real?`, which rejects a
   * `Complex` but ACCEPTS a real `Float::NAN` (measured: `Float::NAN.real?`
   * is `true`; `a+1` with `a: Float::NAN` raises `NonFiniteResultError`, from
   * the FINAL finite check below, never `MathDomainError`). JavaScript has no
   * `Complex`, so every `number` — `NaN` included — is already "real" by
   * construction; this is a passthrough, not a no-op stand-in for a check
   * this port cannot make. The one operation in this slice that can produce
   * a `Complex` in Ruby, `**`, raises the gem's `MathDomainError` itself
   * (`numeric.ts`'s `power`), on the same test Ruby uses to return one.
   */
  private realResult(value: RubyNumeric): RubyNumeric {
    return value;
  }

  /** Ruby: `Evaluator#unsupported` — a refusal the gem itself makes. */
  unsupported(nodeOrMessage: MathNode | string): never {
    const detail =
      typeof nodeOrMessage === "string" ? nodeOrMessage : describeUnsupportedNode(nodeOrMessage);
    throw new UnsupportedExpressionError(detail);
  }

  /**
   * A node `dispatch` has no branch for: a port gap when the gem evaluates
   * that class (`gemEvaluatedClass`), the gem's own refusal otherwise.
   */
  private unported(node: MathNode): never {
    const gemClass = gemEvaluatedClass(node);
    if (gemClass === null) return this.unsupported(node);
    throw new UnsupportedFeatureError(
      "evaluate",
      `Function::${gemClass} is evaluated by the gem but not ported to this slice yet`,
    );
  }

  private dispatch(node: MathNode): RubyNumeric {
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
        return divide(this.evaluateNode(node.parameterOne), this.evaluateNode(node.parameterTwo));
      case "binaryFunction":
        if (node.name === "Power") {
          return power(this.evaluateNode(node.parameterOne), this.evaluateNode(node.parameterTwo));
        }
        return this.unported(node);
      default:
        return this.unported(node);
    }
  }

  /** Ruby: `Symbols::Symbol#evaluate`. `::Math::PI` is a Float. */
  private evaluateSymbol(node: SymbolData): RubyNumeric {
    const constant = reservedConstant(node);
    if (constant !== null) return float(constant);
    const name = variableName(node);
    if (name === null) return this.unsupported(node);
    return this.valueFor(name);
  }

  /**
   * Ruby: `Evaluator#evaluate` — the entry point `index.ts`'s `evaluate`
   * calls (through `run`). Returns the Ruby kind of the final value alongside
   * it, so the oracle fixtures can check the kind tracking itself; the kind
   * is not part of the public result. A final Rational or unsafe Integer is
   * refused in `finalResult`.
   */
  static runWithKind(formula: FormulaNode, bindings: EvaluationBindings = {}): FinalNumeric {
    const evaluator = new Evaluator(bindings);
    return finalResult(evaluator.evaluateFormula(formula), () => {
      throw new NonFiniteResultError();
    });
  }

  static run(formula: FormulaNode, bindings: EvaluationBindings = {}): number {
    return Evaluator.runWithKind(formula, bindings).value;
  }
}
