/** Closed numeric JSON AST profile. All arithmetic belongs to the existing evaluator. */
import {
  AbsNode,
  BinaryFunctionNode,
  FormulaNode,
  FracNode,
  type MathNode,
  NumberNode,
  SqrtNode,
  SymbolNode,
  UnaryFunctionNode,
} from "../core/nodes";
import { EvaluationError } from "./errors";
import { evaluateResult } from "./evaluate";
import type { EvaluationBoundary, EvaluationOperand, EvaluationValue } from "./result";

const SCHEMA = "plurimath.evaluate.numeric/1";
const ENGINE = "plurimath.numeric/1";
const GRAMMAR = "plurimath.numeric-ast/1";
const DECIMAL = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ERROR_CODES = new Map<string, string>([
  ["EVAL_DIVISION_BY_ZERO", "DivisionByZeroError"],
  ["EVAL_MATH_DOMAIN", "MathDomainError"],
  ["EVAL_MISSING_VARIABLE", "MissingVariableError"],
  ["EVAL_NON_FINITE_RESULT", "NonFiniteResultError"],
  ["EVAL_UNSUPPORTED_EXPRESSION", "UnsupportedExpressionError"],
  ["EVAL_INVALID_BINDING", "InvalidBindingError"],
  ["EVAL_INVALID_BINDING_KEY", "InvalidBindingKeyError"],
]);
type Json = null | boolean | string | number | Json[] | { [key: string]: Json };
class InvalidRequest extends Error {}
function invalid(): never {
  throw new InvalidRequest();
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
function keys(
  value: unknown,
  allowed: readonly string[],
  required = allowed,
): Record<string, unknown> {
  const result = object(value);
  if (
    Object.keys(result).some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(result, key))
  )
    invalid();
  return result;
}
function decimal(value: unknown): value is string {
  return typeof value === "string" && DECIMAL.exec(value)?.[0] === value;
}

/** Construct the ordinary document AST, preserving explicit binary grouping. */
export function formulaFromRequestAst(ast: unknown): FormulaNode {
  const node = build(ast, 0);
  return node instanceof FormulaNode ? node : new FormulaNode({ value: [node] });
}
function build(value: unknown, depth: number): MathNode {
  if (depth > 64) return invalid();
  const ast = object(value);
  switch (ast.type) {
    case "number": {
      keys(ast, ["type", "text"]);
      if (!decimal(ast.text)) return invalid();
      return new NumberNode({ value: ast.text });
    }
    case "variable": {
      keys(ast, ["type", "name"]);
      if (typeof ast.name !== "string" || NAME.exec(ast.name)?.[0] !== ast.name) return invalid();
      return new SymbolNode({ value: ast.name });
    }
    case "binary": {
      keys(ast, ["type", "operator", "left", "right"]);
      if (typeof ast.operator !== "string" || !["+", "-", "*", "/", "^"].includes(ast.operator))
        return invalid();
      const left = build(ast.left, depth + 1),
        right = build(ast.right, depth + 1);
      if (ast.operator === "/") return new FracNode({ parameterOne: left, parameterTwo: right });
      if (ast.operator === "^")
        return new BinaryFunctionNode({
          name: "Power",
          parameterOne: group(left),
          parameterTwo: group(right),
        });
      if (ast.operator !== "+" && ast.operator !== "-" && ast.operator !== "*") return invalid();
      const ids = { "+": "Plus", "-": "Minus", "*": "Times" } as const;
      return new FormulaNode({
        value: [group(left), new SymbolNode({ id: ids[ast.operator] }), group(right)],
      });
    }
    case "unary": {
      keys(ast, ["type", "operator", "operand"]);
      if (ast.operator !== "+" && ast.operator !== "-") return invalid();
      return new FormulaNode({
        value: [
          new SymbolNode({ id: ast.operator === "+" ? "Plus" : "Minus" }),
          group(build(ast.operand, depth + 1)),
        ],
      });
    }
    case "call": {
      keys(ast, ["type", "name", "argument"]);
      const child = build(ast.argument, depth + 1);
      if (ast.name === "sqrt") return new SqrtNode({ parameterOne: child });
      if (ast.name === "abs") return new AbsNode({ parameterOne: child });
      const names: Readonly<Record<string, string>> = {
        sin: "Sin",
        cos: "Cos",
        exp: "Exp",
        ln: "Ln",
      };
      if (typeof ast.name !== "string" || !Object.hasOwn(names, ast.name)) return invalid();
      const name = names[ast.name];
      if (name === undefined) return invalid();
      return new UnaryFunctionNode({ name, parameterOne: child });
    }
    default:
      return invalid();
  }
}

function group(node: MathNode): MathNode {
  return node instanceof FormulaNode
    ? new FormulaNode({
        value: [
          new SymbolNode({ id: "Paren::Lround" }),
          node,
          new SymbolNode({ id: "Paren::Rround" }),
        ],
      })
    : node;
}

function numeric(value: EvaluationValue | EvaluationOperand | null): Json {
  if (value === null) return null;
  switch (value.kind) {
    case "integer":
      return { kind: "integer", value: value.value.toString() };
    case "rational":
      return {
        kind: "rational",
        numerator: value.numerator.toString(),
        denominator: value.denominator.toString(),
      };
    case "decimal":
      return { kind: "decimal", value: value.value, precision: value.precision };
    case "literal":
      return { kind: "literal", text: value.text };
    case "float": {
      const bytes = new Uint8Array(8);
      new DataView(bytes.buffer).setFloat64(0, value.value, false);
      return {
        kind: "float",
        bits: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
      };
    }
  }
}
function boundary(value: EvaluationBoundary): Json {
  return {
    operation: value.operation,
    operands: value.operands.map(numeric),
    // biome-ignore lint/style/useNamingConvention: the shared wire uses snake_case.
    operand_accuracy: value.operandAccuracy,
    action: value.action,
    result: numeric(value.result),
  };
}
function canonical(value: Json): string {
  const ordered = (item: Json): Json => {
    if (Array.isArray(item)) return item.map(ordered);
    if (item !== null && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
          .map(([key, entry]) => [key, ordered(entry)]),
      );
    return item;
  };
  return JSON.stringify(ordered(value));
}
function envelope(): Record<string, Json> {
  return { schema: SCHEMA, engine: ENGINE, grammar: GRAMMAR };
}

/** JSON in/out; does not parse text or consult process, filesystem or ambient configuration. */
export function evaluateRequest(json: string): string {
  try {
    if (typeof json !== "string") return invalid();
    const request = keys(
      JSON.parse(json),
      ["schema", "ast", "bindings", "mode", "guard_digits"],
      ["schema", "ast"],
    );
    if (request.schema !== SCHEMA) return invalid();
    const mode = Object.hasOwn(request, "mode") ? request.mode : "strict";
    if (mode !== "strict" && mode !== "approximate") return invalid();
    const digits = request.guard_digits ?? null;
    if (
      digits !== null &&
      (typeof digits !== "number" || !Number.isInteger(digits) || digits <= 0 || digits > 1000)
    )
      return invalid();
    const input = Object.hasOwn(request, "bindings") ? object(request.bindings) : {};
    const bindings: Record<string, string> = Object.create(null) as Record<string, string>;
    for (const [name, value] of Object.entries(input)) {
      if (NAME.exec(name)?.[0] !== name || !decimal(value)) return invalid();
      bindings[name] = value;
    }
    const result = evaluateResult(formulaFromRequestAst(request.ast), bindings, {
      mode,
      guardDigits: digits,
    });
    const body: Record<string, Json> = {
      value: numeric(result.value),
      boundaries: result.boundaries.map(boundary),
      deferred: result.value === null,
    };
    if (result.value === null) body.unevaluated_ast = request.ast as Json;
    return canonical({ ...envelope(), ok: true, result: body });
  } catch (error) {
    if (error instanceof InvalidRequest || error instanceof SyntaxError)
      return canonical({ ...envelope(), ok: false, error: { code: "InvalidRequest" } });
    const code = error instanceof EvaluationError ? ERROR_CODES.get(error.code) : undefined;
    if (code) return canonical({ ...envelope(), ok: false, error: { code } });
    throw error;
  }
}
