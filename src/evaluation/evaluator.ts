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
import {
  type FormulaNode,
  type MathNode,
  NODE_KINDS,
  type NodeParameter,
  type NodeSequence,
} from "../core/nodes";
import { type EvaluationBindings, normalizeBindings } from "./bindings";
import {
  MathDomainError,
  MissingVariableError,
  NonFiniteResultError,
  UnsupportedExpressionError,
} from "./errors";
import { ExpressionParser } from "./expression-parser";
import { Iteration, nodeVariableName } from "./iteration";
import {
  mathAcos,
  mathAsin,
  mathAtan,
  mathCos,
  mathExp,
  mathLog,
  mathSin,
  mathSqrt,
  mathTan,
} from "./libm";
import {
  absolute,
  ceilOf,
  compare,
  divide,
  type FinalNumeric,
  finalResult,
  float,
  floorOf,
  fromBinding,
  integer,
  integerGcd,
  integerLcm,
  modulo,
  negate,
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
const FLOAT_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

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
function toNodeArray(nodes: NodeParameter | NodeSequence): NodeSequence {
  if (nodes === null) return [];
  if (Array.isArray(nodes)) return nodes as NodeSequence;
  if (typeof nodes === "string") return [nodes];
  if (typeof nodes === "object" && "kind" in nodes) return [nodes as MathNode];
  return [];
}

/** The per-call settings `index.ts`'s `EvaluationOptions` carries, resolved. */
export interface EvaluatorSettings {
  /**
   * Ruby: `Plurimath.configuration.evaluation_max_iterations` — the cap on a
   * `Sum`/`Prod` step count, `null` for none. `configuration.rb`'s
   * `DEFAULT_MAX_ITERATIONS` is `100_000` (the gem's README says 1,000,000;
   * the code, which is what runs, says 100,000 — `TODO.plan/deferred.md`).
   */
  readonly maxIterations: number | null;
}

/** Ruby: `Configuration::DEFAULT_MAX_ITERATIONS` (`configuration.rb`). */
export const DEFAULT_MAX_ITERATIONS = 100_000;

const DEFAULT_SETTINGS: EvaluatorSettings = { maxIterations: DEFAULT_MAX_ITERATIONS };

/** The `binaryFunction`/`unaryFunction` carriers, whose `name` is the gem class basename. */
type FunctionNode = Extract<MathNode, { kind: "binaryFunction" | "unaryFunction" }>;

/** One gem class's `#evaluate`, over the carrier node it arrives as. */
type FunctionEvaluator = (evaluator: Evaluator, node: FunctionNode) => RubyNumeric;

/** The `parameterTwo` of a carrier, which only `binaryFunction` has. */
function secondParameter(node: FunctionNode): NodeParameter | undefined {
  return node.kind === "binaryFunction" ? node.parameterTwo : undefined;
}

/**
 * Ruby: a `Math` module function applied to the evaluated operand
 * (`Sin#evaluate` is `::Math.sin(evaluator.evaluate_node(parameter_one))`),
 * always a Float.
 */
function mathFunction(apply: (x: RubyNumeric) => number): FunctionEvaluator {
  return (ev, node) => float(apply(ev.evaluateNode(node.parameterOne)));
}

/**
 * Ruby: `Cot`/`Sec`/`Csc#evaluate` — `evaluator.divide(1.0, ::Math.tan(x))`
 * (`cos`, `sin`): `DivisionByZeroError` when the `Math` result is exactly
 * zero (`tan(0)`, `sin(0)`; no double's `cos` is), otherwise IEEE division,
 * which is exact given the same operand — so the band of the `Math` function
 * underneath is the only refusal these need.
 */
function reciprocal(apply: (x: RubyNumeric) => number): FunctionEvaluator {
  return (ev, node) => divide(float(1), float(apply(ev.evaluateNode(node.parameterOne))));
}

/**
 * Ruby: `Gcd#evaluate`/`Lcm#evaluate` — every argument is evaluated first
 * (`function_arguments`), then all must be Integers (`MathDomainError`
 * otherwise), then `values.reduce(:gcd)`: a single argument is returned as
 * it is, sign included (`gcd(-4)` is `-4`), since `reduce` never calls
 * `gcd` on one element.
 */
function reduceIntegers(
  evaluator: Evaluator,
  node: FunctionNode,
  name: "gcd" | "lcm",
  step: (a: bigint, b: bigint) => bigint,
): RubyNumeric {
  const values = evaluator.functionArguments(node.parameterOne);
  const integers: bigint[] = [];
  for (const value of values) {
    if (value.kind !== "integer") throw new MathDomainError(`${name} requires integer arguments`);
    integers.push(value.value);
  }
  let result = integers[0] as bigint;
  for (const value of integers.slice(1)) result = step(result, value);
  return integer(result);
}

/**
 * Ruby: `Array#max`/`Array#min` over `function_arguments` — the first
 * argument is the running best and each later one replaces it only when
 * strictly better by `best <=> candidate` (`array.c`'s `ary_max_generic` and
 * its fast paths), so of equal values the FIRST is kept, kind included
 * (`max(2,2.0)` is the Integer `2`, `max(2.0,2)` the Float `2.0`). A
 * comparison with `NaN` is `nil`, on which Ruby raises `ArgumentError`
 * ("comparison of Float with 1 failed") — not an evaluation error, so it
 * escapes `Formula#evaluate`, and this port refuses at the same point
 * instead. A single argument is never compared, so `max(NaN)` is `NaN`.
 */
function extremum(evaluator: Evaluator, node: FunctionNode, sign: 1 | -1): RubyNumeric {
  const values = evaluator.functionArguments(node.parameterOne);
  let best = values[0] as RubyNumeric;
  for (const candidate of values.slice(1)) {
    const order = compare(best, candidate);
    if (order === null) {
      throw new UnsupportedFeatureError(
        "evaluate",
        "Ruby raises ArgumentError (comparison with NaN failed) here, which is not an evaluation error",
      );
    }
    if (order === -sign) best = candidate;
  }
  return best;
}

/**
 * Every `binaryFunction`/`unaryFunction` class this port evaluates, keyed by
 * the gem class basename the carrier's `name` holds (`core/nodes.ts`), each
 * one Ruby's `Function::<Name>#evaluate`. A name not here falls through to
 * `Evaluator#unported`. `scripts/generate-evaluation-fixtures.rb` reads the
 * keys of this table out of this file to validate its `unported` rows, so it
 * stays a literal `new Map([...])` of `["Name", ...]` entries.
 */
const FUNCTION_EVALUATORS: ReadonlyMap<string, FunctionEvaluator> = new Map<
  string,
  FunctionEvaluator
>([
  // Ruby: `Power#evaluate` — `evaluator.power(base, exponent)`.
  [
    "Power",
    (ev, node) => power(ev.evaluateNode(node.parameterOne), ev.evaluateNode(secondParameter(node))),
  ],
  // Ruby: `Mod#evaluate` — `evaluator.modulo(a, b)`.
  [
    "Mod",
    (ev, node) =>
      modulo(ev.evaluateNode(node.parameterOne), ev.evaluateNode(secondParameter(node))),
  ],
  // Ruby: `Root#evaluate` — `power(radicand, divide(1.0, index))`, the index
  // in `parameter_one`, the radicand in `parameter_two`, evaluated in that
  // order: radicand first.
  [
    "Root",
    (ev, node) => {
      const radicand = ev.evaluateNode(secondParameter(node));
      return power(radicand, divide(float(1), ev.evaluateNode(node.parameterOne)));
    },
  ],
  ["Gcd", (ev, node) => reduceIntegers(ev, node, "gcd", integerGcd)],
  ["Lcm", (ev, node) => reduceIntegers(ev, node, "lcm", integerLcm)],
  ["Max", (ev, node) => extremum(ev, node, 1)],
  ["Min", (ev, node) => extremum(ev, node, -1)],
  ["Sin", mathFunction(mathSin)],
  ["Cos", mathFunction(mathCos)],
  ["Tan", mathFunction(mathTan)],
  ["Arcsin", mathFunction(mathAsin)],
  ["Arccos", mathFunction(mathAcos)],
  ["Arctan", mathFunction(mathAtan)],
  ["Exp", mathFunction(mathExp)],
  ["Ln", mathFunction(mathLog)],
  ["Cot", reciprocal(mathTan)],
  ["Sec", reciprocal(mathCos)],
  ["Csc", reciprocal(mathSin)],
]);

/**
 * Ruby: `Evaluator#split_on_commas` — a `Symbols::Comma` token starts a new
 * segment; there is always at least one (possibly empty) segment.
 */
function splitOnCommas(nodes: readonly (MathNode | string)[]): (MathNode | string)[][] {
  const segments: (MathNode | string)[][] = [[]];
  for (const node of nodes) {
    if (typeof node !== "string" && node.kind === "symbol" && node.id === "Comma") {
      segments.push([]);
    } else {
      (segments[segments.length - 1] as (MathNode | string)[]).push(node);
    }
  }
  return segments;
}

export class Evaluator {
  private readonly bindings: Map<string, RubyNumeric>;
  readonly maxIterations: number | null;

  constructor(bindings: EvaluationBindings = {}, settings: EvaluatorSettings = DEFAULT_SETTINGS) {
    this.bindings = new Map(
      [...normalizeBindings(bindings)].map(([name, value]) => [name, fromBinding(value)] as const),
    );
    this.maxIterations = settings.maxIterations;
  }

  evaluateFormula(formula: FormulaNode | Extract<MathNode, { kind: "formula" }>): RubyNumeric {
    return this.realResult(new ExpressionParser(this, formula.value ?? []).parse());
  }

  /** Ruby: `Evaluator#evaluate_nodes` — a `Fenced` body, evaluated as its own formula. */
  evaluateNodes(nodes: NodeParameter | NodeSequence): RubyNumeric {
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
   * Ruby: `Mod#evaluate_negated` — `-a mod b` negates the dividend, not the
   * result (`(-7) mod 3` is `2`), reached from `ExpressionParser`'s unary
   * minus when the next token is a `Mod`.
   */
  evaluateNegatedMod(node: MathNode): RubyNumeric {
    const mod = node as FunctionNode;
    return modulo(
      negate(this.evaluateNode(mod.parameterOne)),
      this.evaluateNode(secondParameter(mod)),
    );
  }

  /**
   * Ruby: `Evaluator#value_for`. A caller's binding's Ruby kind is inferred
   * from the JS value when the evaluator is built (`numeric.ts`'s
   * `fromBinding`: a safe integer is an Integer); an iteration index is
   * always an Integer.
   */
  valueFor(name: string): RubyNumeric {
    const value = this.bindings.get(name);
    if (value === undefined) throw new MissingVariableError(name);
    return value;
  }

  /**
   * Ruby: `Evaluator#with_binding` — binds `name` for the duration of `body`,
   * shadowing any outer binding of the same name and restoring it (or
   * removing the name again) afterwards, whether `body` returns or throws.
   */
  withBinding<T>(name: string, value: RubyNumeric, body: () => T): T {
    const hadKey = this.bindings.has(name);
    const previous = this.bindings.get(name);
    this.bindings.set(name, value);
    try {
      return body();
    } finally {
      if (hadKey) this.bindings.set(name, previous as RubyNumeric);
      else this.bindings.delete(name);
    }
  }

  /**
   * Ruby: `Evaluator#function_arguments` — a `Fenced` argument's body split
   * on commas (`max(2,3)`), anything else as a one-segment list
   * (`Array(node)`: a bare operand, or `nil` as an empty segment), each
   * segment evaluated as its own formula (`evaluate_arguments`), so an empty
   * one (`max()`, `max(,2)`) raises "empty expression".
   */
  functionArguments(node: NodeParameter): RubyNumeric[] {
    const nodes =
      isMathNode(node) && node.kind === "fenced"
        ? toNodeArray(node.parameterTwo)
        : toNodeArray(node);
    return splitOnCommas(nodes).map((segment) => this.evaluateNodes(segment));
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
      // Ruby: `Abs`/`Ceil`/`Floor#evaluate` — the operand's own `abs`/`ceil`/`floor`.
      case "abs":
        return absolute(this.evaluateNode(node.parameterOne));
      case "ceil":
        return ceilOf(this.evaluateNode(node.parameterOne));
      case "floor":
        return floorOf(this.evaluateNode(node.parameterOne));
      // Ruby: `Sqrt#evaluate` — `::Math.sqrt(operand)`.
      case "sqrt":
        return float(mathSqrt(this.evaluateNode(node.parameterOne)));
      // Ruby: `Sum`/`Prod#evaluate` — all three slots are required
      // (`unsupported(self)` otherwise), then `Iteration#accumulate(0, :+)` /
      // `(1, :*)`.
      case "sum":
      case "prod":
        if (node.parameterOne == null || node.parameterTwo == null || node.parameterThree == null) {
          return this.unsupported(node);
        }
        return new Iteration(
          this,
          node.parameterOne,
          node.parameterTwo,
          node.parameterThree,
        ).accumulate(node.kind === "sum" ? 0n : 1n, node.kind === "sum" ? "+" : "*");
      // Ruby: `Text#evaluate` — a plain, non-blank text names a variable.
      case "text": {
        const name = nodeVariableName(node);
        if (name === null) return this.unsupported(node);
        return this.valueFor(name);
      }
      case "binaryFunction":
      case "unaryFunction": {
        const evaluateFunction = FUNCTION_EVALUATORS.get(node.name);
        if (evaluateFunction !== undefined) return evaluateFunction(this, node);
        return this.unported(node);
      }
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
  static runWithKind(
    formula: FormulaNode,
    bindings: EvaluationBindings = {},
    settings: EvaluatorSettings = DEFAULT_SETTINGS,
  ): FinalNumeric {
    const evaluator = new Evaluator(bindings, settings);
    return finalResult(evaluator.evaluateFormula(formula), () => {
      throw new NonFiniteResultError();
    });
  }

  static run(
    formula: FormulaNode,
    bindings: EvaluationBindings = {},
    settings: EvaluatorSettings = DEFAULT_SETTINGS,
  ): number {
    return Evaluator.runWithKind(formula, bindings, settings).value;
  }
}
