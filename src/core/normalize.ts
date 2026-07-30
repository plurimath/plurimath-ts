/**
 * The normalized model: the serialization the corpus compares against Ruby's
 * (ARCHITECTURE.md §5, "two distinct projections").
 *
 * It is the *strict* projection — every assigned field of every node, in the
 * order Ruby's `variables.sort` produces — and catches any tree difference.
 * `./equality` is the other projection: looser, per-class, and deliberately
 * separate. Conflating them was a real error in an earlier draft.
 *
 * Shape mirrors the generator's `serialize_node`: `{ class, fields }`, where
 * `class` is the Ruby class name with the `Plurimath::` prefix stripped.
 * A field is emitted when the TypeScript node has it, and skipped when it is
 * `undefined` — Ruby only serializes instance variables it actually assigned.
 */

import { RenderError } from "./errors";
import { isMathNode, type MathNode, type NodeKind } from "./nodes";

export type NormalizedValue =
  | null
  | boolean
  | number
  | string
  | NormalizedNode
  | readonly NormalizedValue[]
  | { readonly [key: string]: NormalizedValue };

export interface NormalizedNode {
  readonly class: string;
  readonly fields: { readonly [key: string]: NormalizedValue };
}

/** How an aliased Ruby class is rebuilt from the carrier node's name. */
interface NodeIdentity {
  readonly field: "id" | "name";
  readonly prefix: string;
}

export interface NodeSpec {
  /** Ruby class name, `Plurimath::` stripped, as the census records it. */
  readonly rubyClass: string;
  readonly identity?: NodeIdentity;
  /** `[ruby ivar, TypeScript field]`, sorted as Ruby sorts `variables`. */
  readonly fields: readonly (readonly [string, string])[];
}

/** The census projection. Field lists are checked against it by the suite. */
export const NODE_SPECS: { readonly [K in NodeKind]: NodeSpec } = {
  abs: {
    rubyClass: "Math::Function::Abs",
    fields: [
      ["close_paren", "closeParen"],
      ["hide_function_name", "hideFunctionName"],
      ["open_paren", "openParen"],
      ["parameter_one", "parameterOne"],
    ],
  },
  bar: {
    rubyClass: "Math::Function::Bar",
    fields: [
      ["attributes", "attributes"],
      ["hide_function_name", "hideFunctionName"],
      ["parameter_one", "parameterOne"],
    ],
  },
  base: {
    rubyClass: "Math::Function::Base",
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["options", "options"],
      ["parameter_one", "parameterOne"],
      ["parameter_two", "parameterTwo"],
    ],
  },
  binaryFunction: {
    rubyClass: "Math::Function::BinaryFunction",
    identity: { field: "name", prefix: "Math::Function" },
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["parameter_one", "parameterOne"],
      ["parameter_two", "parameterTwo"],
    ],
  },
  ceil: {
    rubyClass: "Math::Function::Ceil",
    fields: [
      ["close_paren", "closeParen"],
      ["hide_function_name", "hideFunctionName"],
      ["open_paren", "openParen"],
      ["parameter_one", "parameterOne"],
    ],
  },
  color: {
    rubyClass: "Math::Function::Color",
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["options", "options"],
      ["parameter_one", "parameterOne"],
      ["parameter_two", "parameterTwo"],
    ],
  },
  ddot: {
    rubyClass: "Math::Function::Ddot",
    fields: [
      ["attributes", "attributes"],
      ["hide_function_name", "hideFunctionName"],
      ["parameter_one", "parameterOne"],
    ],
  },
  dot: {
    rubyClass: "Math::Function::Dot",
    fields: [
      ["attributes", "attributes"],
      ["hide_function_name", "hideFunctionName"],
      ["parameter_one", "parameterOne"],
    ],
  },
  fenced: {
    rubyClass: "Math::Function::Fenced",
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["options", "options"],
      ["parameter_one", "parameterOne"],
      ["parameter_three", "parameterThree"],
      ["parameter_two", "parameterTwo"],
    ],
  },
  floor: {
    rubyClass: "Math::Function::Floor",
    fields: [
      ["close_paren", "closeParen"],
      ["hide_function_name", "hideFunctionName"],
      ["open_paren", "openParen"],
      ["parameter_one", "parameterOne"],
    ],
  },
  fontStyle: {
    rubyClass: "Math::Function::FontStyle",
    identity: { field: "name", prefix: "Math::Function::FontStyle" },
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["parameter_one", "parameterOne"],
      ["parameter_two", "parameterTwo"],
    ],
  },
  formula: {
    rubyClass: "Math::Formula",
    identity: { field: "name", prefix: "Math::Formula" },
    fields: [
      ["display", "display"],
      ["displaystyle", "displaystyle"],
      ["input_string", "inputString"],
      ["left_right_wrapper", "leftRightWrapper"],
      ["value", "value"],
    ],
  },
  frac: {
    rubyClass: "Math::Function::Frac",
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["options", "options"],
      ["parameter_one", "parameterOne"],
      ["parameter_two", "parameterTwo"],
    ],
  },
  hat: {
    rubyClass: "Math::Function::Hat",
    fields: [
      ["attributes", "attributes"],
      ["hide_function_name", "hideFunctionName"],
      ["parameter_one", "parameterOne"],
    ],
  },
  int: {
    rubyClass: "Math::Function::Int",
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["options", "options"],
      ["parameter_one", "parameterOne"],
      ["parameter_three", "parameterThree"],
      ["parameter_two", "parameterTwo"],
    ],
  },
  linebreak: {
    rubyClass: "Math::Function::Linebreak",
    fields: [
      ["attributes", "attributes"],
      ["hide_function_name", "hideFunctionName"],
      ["parameter_one", "parameterOne"],
    ],
  },
  mpadded: {
    rubyClass: "Math::Function::Mpadded",
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["options", "options"],
      ["parameter_one", "parameterOne"],
    ],
  },
  mrow: {
    rubyClass: "Math::Formula::Mrow",
    fields: [
      ["display", "display"],
      ["displaystyle", "displaystyle"],
      ["input_string", "inputString"],
      ["is_mrow", "isMrow"],
      ["left_right_wrapper", "leftRightWrapper"],
      ["value", "value"],
    ],
  },
  nary: {
    rubyClass: "Math::Function::Nary",
    fields: [
      ["options", "options"],
      ["parameter_four", "parameterFour"],
      ["parameter_one", "parameterOne"],
      ["parameter_three", "parameterThree"],
      ["parameter_two", "parameterTwo"],
    ],
  },
  norm: {
    rubyClass: "Math::Function::Norm",
    fields: [
      ["close_paren", "closeParen"],
      ["hide_function_name", "hideFunctionName"],
      ["open_paren", "openParen"],
      ["parameter_one", "parameterOne"],
    ],
  },
  number: {
    rubyClass: "Math::Number",
    fields: [
      ["base", "base"],
      ["mini_sub_sized", "miniSubSized"],
      ["mini_sup_sized", "miniSupSized"],
      ["value", "value"],
    ],
  },
  obrace: {
    rubyClass: "Math::Function::Obrace",
    fields: [
      ["attributes", "attributes"],
      ["hide_function_name", "hideFunctionName"],
      ["parameter_one", "parameterOne"],
    ],
  },
  oint: {
    rubyClass: "Math::Function::Oint",
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["options", "options"],
      ["parameter_one", "parameterOne"],
      ["parameter_three", "parameterThree"],
      ["parameter_two", "parameterTwo"],
    ],
  },
  overleftrightarrow: {
    rubyClass: "Math::Function::Overleftrightarrow",
    fields: [
      ["attributes", "attributes"],
      ["hide_function_name", "hideFunctionName"],
      ["parameter_one", "parameterOne"],
    ],
  },
  overset: {
    rubyClass: "Math::Function::Overset",
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["options", "options"],
      ["parameter_one", "parameterOne"],
      ["parameter_two", "parameterTwo"],
    ],
  },
  prod: {
    rubyClass: "Math::Function::Prod",
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["options", "options"],
      ["parameter_one", "parameterOne"],
      ["parameter_three", "parameterThree"],
      ["parameter_two", "parameterTwo"],
    ],
  },
  sqrt: {
    rubyClass: "Math::Function::Sqrt",
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["options", "options"],
      ["parameter_one", "parameterOne"],
    ],
  },
  sum: {
    rubyClass: "Math::Function::Sum",
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["options", "options"],
      ["parameter_one", "parameterOne"],
      ["parameter_three", "parameterThree"],
      ["parameter_two", "parameterTwo"],
    ],
  },
  symbol: {
    rubyClass: "Math::Symbols::Symbol",
    identity: { field: "id", prefix: "Math::Symbols" },
    fields: [
      ["mini_sub_sized", "miniSubSized"],
      ["mini_sup_sized", "miniSupSized"],
      ["options", "options"],
      ["slashed", "slashed"],
      ["value", "value"],
    ],
  },
  table: {
    rubyClass: "Math::Function::Table",
    identity: { field: "name", prefix: "Math::Function::Table" },
    fields: [
      ["close_paren", "closeParen"],
      ["open_paren", "openParen"],
      ["options", "options"],
      ["value", "value"],
    ],
  },
  ternaryFunction: {
    rubyClass: "Math::Function::TernaryFunction",
    identity: { field: "name", prefix: "Math::Function" },
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["parameter_one", "parameterOne"],
      ["parameter_three", "parameterThree"],
      ["parameter_two", "parameterTwo"],
    ],
  },
  text: {
    rubyClass: "Math::Function::Text",
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["lang", "lang"],
      ["parameter_one", "parameterOne"],
    ],
  },
  tilde: {
    rubyClass: "Math::Function::Tilde",
    fields: [
      ["attributes", "attributes"],
      ["hide_function_name", "hideFunctionName"],
      ["parameter_one", "parameterOne"],
    ],
  },
  ubrace: {
    rubyClass: "Math::Function::Ubrace",
    fields: [
      ["attributes", "attributes"],
      ["hide_function_name", "hideFunctionName"],
      ["parameter_one", "parameterOne"],
    ],
  },
  ul: {
    rubyClass: "Math::Function::Ul",
    fields: [
      ["attributes", "attributes"],
      ["hide_function_name", "hideFunctionName"],
      ["parameter_one", "parameterOne"],
    ],
  },
  unaryFunction: {
    rubyClass: "Math::Function::UnaryFunction",
    identity: { field: "name", prefix: "Math::Function" },
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["parameter_one", "parameterOne"],
    ],
  },
  underset: {
    rubyClass: "Math::Function::Underset",
    fields: [
      ["hide_function_name", "hideFunctionName"],
      ["options", "options"],
      ["parameter_one", "parameterOne"],
      ["parameter_two", "parameterTwo"],
    ],
  },
  vec: {
    rubyClass: "Math::Function::Vec",
    fields: [
      ["attributes", "attributes"],
      ["hide_function_name", "hideFunctionName"],
      ["parameter_one", "parameterOne"],
    ],
  },
};

/** The Ruby class a node serializes as, alias name folded back in. */
export function rubyClassName(node: MathNode): string {
  const spec = NODE_SPECS[node.kind];
  const identity = spec.identity;
  if (identity === undefined) return spec.rubyClass;
  const name = (node as unknown as Record<string, unknown>)[identity.field];
  return typeof name === "string" ? `${identity.prefix}::${name}` : spec.rubyClass;
}

/** Serializes a node tree into the shape the Ruby-generated corpus records. */
export function normalize(node: MathNode): NormalizedNode {
  const spec = NODE_SPECS[node.kind];
  if (spec === undefined) {
    throw new RenderError(`Unknown node kind "${node.kind}"`, "normalized-model", node.kind);
  }
  const source = node as unknown as Record<string, unknown>;
  const fields: { [key: string]: NormalizedValue } = {};
  for (const [rubyField, tsField] of spec.fields) {
    const value = source[tsField];
    if (value === undefined) continue;
    fields[rubyField] = normalizeValue(value, `${node.kind}.${tsField}`);
  }
  return { class: rubyClassName(node), fields };
}

/**
 * Mirrors the generator's `serialize_value`, including its refusal to fall
 * back to `to_s`: an unserializable field is a model gap, and hiding it
 * behind a string would make the corpus agree with a broken tree.
 */
function normalizeValue(value: unknown, path: string): NormalizedValue {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return value;
  if (Array.isArray(value)) {
    return (value as readonly unknown[]).map((item, index) =>
      normalizeValue(item, `${path}[${index}]`),
    );
  }
  if (isMathNode(value)) return normalize(value);
  if (typeof value === "object" && typeof (value as { kind?: unknown }).kind === "string") {
    // Something node-shaped carrying a kind the union does not declare: a
    // forged or stale node. Serializing it as a plain hash would let a broken
    // tree agree with the corpus, so it fails here instead.
    const kind = (value as { kind: string }).kind;
    throw new RenderError(`Unknown node kind "${kind}" at ${path}`, "normalized-model", kind);
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    const result: { [key: string]: NormalizedValue } = {};
    for (const [key, item] of entries) {
      result[key] = normalizeValue(item, `${path}.${key}`);
    }
    return result;
  }
  throw new RenderError(`Cannot normalize ${typeof value} at ${path}`, "normalized-model", path);
}
