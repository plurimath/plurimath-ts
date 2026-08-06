/**
 * The runtime half of the structural-dispatch contract (ARCHITECTURE.md §5):
 * a renderer's entry point calls `assertMathNodeShape` so that a malformed
 * tree fails as `RenderError`, never as a raw `TypeError` deep inside a
 * dispatcher. The compile-time half is the closed `MathNode` union.
 *
 * The expectations are DERIVED from data core already owns — `NODE_SPECS`
 * (which fields a kind has) and `RUBY_ABSTRACT_CLASSES` (which carriers must
 * name the class they stand in for) — never restated per kind, so a field
 * added to the model is a field this check knows about with no second edit
 * (PORTING-STANDARDS.md, "Generated data discipline").
 *
 * What "valid shape" means here, precisely:
 *
 *   - the value is an object whose `kind` is a declared `NodeKind`;
 *   - if the kind's Ruby carrier is abstract (`UnaryFunction`,
 *     `BinaryFunction`, `TernaryFunction`), its identity slot (`name`) is
 *     present — a bare abstract carrier names no Ruby class, so no renderer
 *     could have measured behaviour for it. Concrete carriers (`Formula`,
 *     `Symbol`, `Table`, `FontStyle`) may omit theirs: the bare carrier IS a
 *     Ruby class;
 *   - every identity slot that is present is a string;
 *   - every declared field that is present holds a structurally sound slot
 *     value, checked recursively: primitives, `null`, lists, plain
 *     option/attribute hashes, and nodes that themselves pass this check.
 *     An object carrying a *string* `kind` this model does not declare is
 *     rejected wherever it sits — the same stance `normalize` takes, because
 *     serializing a forged node as a plain hash would let a broken tree
 *     agree with the corpus.
 *
 * Deliberately NOT checked: field presence beyond the identity slots, and
 * per-field value types. Ruby reads an unassigned ivar as `nil`, so a missing
 * `parameterOne` is a legal state the gem itself produces; where the gem then
 * *crashes* on such a value at render time (`Formula` with a nil `value`,
 * `Power` with a nil first parameter), the renderer raises its own
 * `RenderError` at that exact spot — mirroring where the gem fails, which a
 * shape table cannot express. Extra fields are ignored, as constructors
 * ignore unknown keys.
 */

import { RenderError } from "./errors";
import type { MathNode, NodeKind } from "./nodes";
import { RUBY_ABSTRACT_CLASSES } from "./nodes";
import { NODE_SPECS } from "./normalize";

/** Ruby classes whose carrier node MUST carry its identity slot. */
const ABSTRACT_CARRIERS: ReadonlySet<string> = new Set<string>(RUBY_ABSTRACT_CLASSES);

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  if (typeof value === "string") return JSON.stringify(value);
  return `a ${typeof value}`;
}

/**
 * Verifies that `value` is a structurally valid `MathNode` tree, throwing a
 * `RenderError` naming the offending path when it is not.
 *
 * `format` names the caller in the error (`"asciimath"`, `"latex"`, ...);
 * renderers call this once, at their entry point, and may then dispatch on
 * `kind` without re-checking shape. See the module docs for the exact
 * contract — in one line: every node has a known `kind`, abstract carriers
 * carry their `name`, and no slot holds a value no Ruby node could hold.
 */
export function assertMathNodeShape(value: unknown, format: string): asserts value is MathNode {
  assertNode(value, format, "node");
}

function assertNode(value: unknown, format: string, path: string): asserts value is MathNode {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RenderError(
      `${path}: expected a math node, found ${describeValue(value)}`,
      format,
      "unknown",
    );
  }
  const kind = (value as { readonly kind?: unknown }).kind;
  if (typeof kind !== "string" || !Object.hasOwn(NODE_SPECS, kind)) {
    throw new RenderError(
      `${path}: unknown node kind ${describeValue(kind)}`,
      format,
      typeof kind === "string" ? kind : "unknown",
    );
  }
  const spec = NODE_SPECS[kind as NodeKind];
  const node = value as Record<string, unknown>;

  const identity = spec.identity;
  if (identity !== undefined) {
    const name = node[identity.field];
    if (name === undefined) {
      if (ABSTRACT_CARRIERS.has(spec.rubyClass)) {
        throw new RenderError(
          `${path}: "${kind}" is missing its "${identity.field}" slot — ` +
            `${spec.rubyClass} is abstract in the gem, so a bare carrier names no class`,
          format,
          kind,
        );
      }
    } else if (typeof name !== "string") {
      throw new RenderError(
        `${path}.${identity.field}: expected a string, found ${describeValue(name)}`,
        format,
        kind,
      );
    }
  }

  for (const [, tsField] of spec.fields) {
    const slot = node[tsField];
    if (slot !== undefined) assertSlot(slot, format, kind, `${path}.${tsField}`);
  }
}

/**
 * One slot value, recursively. The grammar is the union of everything a Ruby
 * node's ivars are observed to hold: nil, strings, booleans, numbers, nodes,
 * lists of any of these, and plain hashes (options, attributes — whose values
 * get the same check, since table parens and alias defaults put real nodes
 * inside).
 */
function assertSlot(value: unknown, format: string, kind: string, path: string): void {
  if (value === null) return;
  const type = typeof value;
  if (type === "string" || type === "boolean" || type === "number") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      if (item !== undefined) assertSlot(item, format, kind, `${path}[${index}]`);
    });
    return;
  }
  if (type === "object") {
    const nested = (value as { readonly kind?: unknown }).kind;
    if (typeof nested === "string" && Object.hasOwn(NODE_SPECS, nested)) {
      assertNode(value, format, path);
      return;
    }
    if (typeof nested === "string") {
      // Node-shaped, but a kind the model does not declare: a forged or stale
      // node. `normalize` refuses the same shape for the same reason.
      throw new RenderError(`${path}: unknown node kind ${describeValue(nested)}`, format, nested);
    }
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item !== undefined) assertSlot(item, format, kind, `${path}.${key}`);
    }
    return;
  }
  // function, symbol, bigint, undefined-inside-object: nothing Ruby can hold.
  throw new RenderError(`${path}: a node slot cannot hold a ${type}`, format, kind);
}
