/**
 * Maps the typed LaTeX model that latexmath-ts returns
 * (`Latexmath::Model::Document`) to the capture tree the LaTeX rule table
 * builds a formula from. Port of plurimath's `Latex::Mapper`
 * (`lib/plurimath/latex/mapper.rb`, plurimath main bab7f52).
 *
 * latexmath owns the grammar and the model. Its model classes are the
 * grammar's captures, typed: each class has one member per capture key, and
 * the few captures its shape normalization adds (latexmath's
 * `grammars/latex.wrappers.json`) are listed in `WRAPPERS`.
 *
 * Ruby's mapper builds each node from its children's values, bottom up, by a
 * table keyed by the node's set attributes (`TYPED`, `SINGLE`, `SEQUENCES`)
 * whose entries and precedence are the LaTeX rule table's. Here that table is
 * `./transform`, ported rule for rule from the same Ruby rules, and
 * `Transform#apply` is the same bottom-up walk. So this module does the part
 * of the mapper that is about the model: which members are set, wrappers,
 * repetitions, text as slices, and the row-break rename. A node no rule fits
 * keeps its children's values keyed by capture name, as in Ruby.
 *
 * A wrapper is always the only capture of its node, so a node is either one
 * wrapper, which stands for its value, or ordinary captures.
 */

import type { ParseValue } from "../../pegkit/index";
import { Slice } from "../../pegkit/slice";

/**
 * The captures latexmath's shape normalization adds, and the value each one
 * stands for: `text` the wrapped text ("" when empty), `text_list` the text
 * or `[]` when it is empty, `items` the list, `absent` nothing.
 */
const WRAPPERS: Readonly<Record<string, "text" | "text_list" | "items" | "absent">> = {
  literal: "text",
  spelling: "text_list",
  // biome-ignore lint/style/useNamingConvention: latexmath's capture name.
  text_list: "text_list",
  items: "items",
  absent: "absent",
};

/** The matrix row break: latexmath names it `row_break`, the rule table `"\\\\"`. */
const RENAMES: Readonly<Record<string, string>> = {
  // biome-ignore lint/style/useNamingConvention: latexmath's capture name.
  row_break: "\\\\",
};

/**
 * Members latexmath derives from its symbol catalog rather than from a
 * capture (`Latexmath::Model.catalog_field?`): never a capture of the node.
 */
const CATALOG_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  "Latexmath::Model::MathSymbol@default": new Set(["value", "kind"]),
};

/** A generated latexmath-ts model instance: its class names its members. */
interface ModelNode {
  readonly constructor: { readonly modelId: string; readonly memberNames: readonly string[] };
  readonly [member: string]: unknown;
}

/** The typed document `latexmath-ts`'s `Parser#parse` returns. */
export interface LatexmathDocument {
  readonly expression?: unknown;
}

function isModelNode(value: unknown): value is ModelNode {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const ctor = (value as { constructor?: { modelId?: unknown; memberNames?: unknown } })
    .constructor;
  return typeof ctor?.modelId === "string" && Array.isArray(ctor.memberNames);
}

/** Unset in the model: lutaml-model-ts writes `ABSENT` (a symbol) or null. */
function isUnset(value: unknown): boolean {
  return value === null || value === undefined || typeof value === "symbol";
}

/** The document's expression, or null for input without a formula. */
export function latexmathExpression(document: LatexmathDocument): unknown {
  return isUnset(document.expression) ? null : document.expression;
}

/**
 * A model value as its capture tree: a node's captures (a hash), a wrapper's
 * value, lists for repetitions, and captured text as a `Slice`.
 */
export function latexmathCaptures(model: unknown): ParseValue {
  return toSlices(captures(model));
}

type Capture = string | null | Capture[] | { [capture: string]: Capture };

function captures(model: unknown): Capture {
  if (Array.isArray(model)) return repetition(model.map(captures));
  if (isModelNode(model)) return nodeCaptures(model);
  if (typeof model === "string") return model;
  if (isUnset(model)) return null;
  throw new TypeError(`latexmath model: unexpected ${typeof model} value`);
}

/**
 * The only repetitions in the model are `items` lists, whose elements are
 * nodes, or null for an element with nothing set. A repetition keeps its
 * nodes; one with none left is `[]` when nothing repeated and "" otherwise.
 */
function repetition(list: Capture[]): Capture {
  const nodes = list.filter(
    (value) => value !== null && typeof value === "object" && !Array.isArray(value),
  );
  if (nodes.length > 0) return nodes;
  return list.length === 0 ? [] : "";
}

function setMembers(node: ModelNode): string[] {
  const catalog = CATALOG_FIELDS[node.constructor.modelId];
  return node.constructor.memberNames.filter((name) => !catalog?.has(name) && !isUnset(node[name]));
}

/** A wrapper's value, null for a node with nothing set, or the node's captures. */
function nodeCaptures(node: ModelNode): Capture {
  const set = setMembers(node);
  const wrapper = set.find((name) => Object.hasOwn(WRAPPERS, name));
  if (wrapper !== undefined) {
    if (set.length !== 1) {
      throw new TypeError(
        `${node.constructor.modelId} sets the wrapper ${wrapper} with ${set.filter((n) => n !== wrapper).join(", ")}`,
      );
    }
    return wrapped(WRAPPERS[wrapper] as string, captures(node[wrapper]));
  }
  if (set.length === 0) return null;
  const hash: { [capture: string]: Capture } = {};
  for (const name of set) hash[RENAMES[name] ?? name] = captures(node[name]);
  return hash;
}

function isEmptyList(value: Capture): boolean {
  return Array.isArray(value) && value.length === 0;
}

function wrapped(kind: string, value: Capture): Capture {
  switch (kind) {
    case "text":
      return value === null || isEmptyList(value) ? "" : value;
    case "text_list":
      return value === "" || isEmptyList(value) ? [] : value;
    case "items":
      return value;
    default:
      return null;
  }
}

function toSlices(tree: Capture): ParseValue {
  if (typeof tree === "string") return new Slice(tree, 0);
  if (Array.isArray(tree)) return tree.map(toSlices);
  if (tree === null) return null;
  const out: Record<string, ParseValue> = {};
  for (const [key, value] of Object.entries(tree)) out[key] = toSlices(value);
  return out;
}
