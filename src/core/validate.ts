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
 *     agree with the corpus. A "plain hash" is a record whose prototype is
 *     `Object.prototype` or `null`: a `Date`, `Map`, `Set`, `RegExp`, or
 *     other class instance is not one — it often carries zero enumerable
 *     entries, so an entry walk alone would wave it through — but it sits
 *     outside this port's supported structural slot representation, so it
 *     is rejected with its class named.
 *   - the tree is finite: a node, list, or hash that is its own ancestor is
 *     rejected with the cycle's path, because without this check the walk
 *     dies as `RangeError` instead of the `RenderError` this contract
 *     promises. One gem path does have an answer for a cycle rather than
 *     looping, so this rejection is not free: `Fenced`'s OMML delimiters are
 *     stringified through Ruby's `#inspect`, which prints a recursion marker
 *     — measured on the oracle at `00c52783`, a `Table` delimiter holding a
 *     self-referential list emits `m:begChr m:val="[[...]]"` and one holding
 *     a self-referential hash emits `{"self" => {...}}`. This check runs
 *     first and refuses both; the divergence is recorded with its trigger in
 *     TODO.plan/deferred.md and pinned by the OMML renderer spec. Sharing
 *     without a cycle (the same object in two sibling slots) stays legal,
 *     because Ruby aliases nodes and arrays freely and renders such trees
 *     fine.
 *   - an explicit `undefined` *entry* inside a list or hash is rejected:
 *     Ruby's only undefined analogue is the unassigned ivar, which is a
 *     missing field (legal, see below), never a present entry. `normalize`
 *     refuses the same shapes. A sparse array's holes read back as the same
 *     `undefined` and are rejected the same way — which is also why a lying
 *     `length` cannot smuggle anything past the walk. The `length` read is
 *     itself validated before it becomes the index loop's bound: a genuine
 *     array's length is spec-clamped to a Uint32 (a non-negative integer at
 *     most 2**32 − 1 — ECMA-262 refuses any other assignment with a
 *     RangeError), so any other report (`Infinity`, `NaN`, a float, a huge
 *     finite lie) can only come from a proxy or forged accessor and is
 *     rejected at the `.length` path — trusted as a bound, an `Infinity`
 *     lie is a walk that never terminates, a third outcome this contract
 *     does not have. A `length` read that *throws* stays an accessor
 *     failure: the read-site wrap below runs before the bound is examined.
 *   - the walk itself has no third outcome: a property read that throws (a
 *     getter or proxy trap — no Ruby ivar read runs code) is wrapped AT THE
 *     READ SITE, keeping its message and the path of the read — so even a
 *     getter's deliberate `RangeError` surfaces as that accessor failure,
 *     never as the depth rejection. "Keeping its message" has one honest
 *     limit: describing a thrown value is itself a `String(error)` call,
 *     running the input's code again — so a thrown value whose own
 *     stringification throws is described by a fixed fallback phrase
 *     instead (`describeThrown`, core/errors.ts), still as the accessor
 *     failure at the read's path. No secondary throw travels, so the only
 *     `RangeError` that can reach the entry point is the walk's own
 *     recursion running out of frames on a finite tree, rethrown as the
 *     too-deep `RenderError`. The gem raises past its own, HIGHER ceiling
 *     too (SystemStackError at roughly 4,656 frames on default stacks,
 *     probed; the band between the two ceilings is a known parity window,
 *     TODO.plan/deferred.md) — and a raw `RangeError` escape here would
 *     break the RenderError-or-pass contract, not just the error type.
 *
 * Deliberately NOT checked: field presence beyond the identity slots, and
 * per-field value types. Ruby reads an unassigned ivar as `nil`, so a missing
 * `parameterOne` is a legal state the gem itself produces; where the gem then
 * *crashes* on such a value at render time (`Formula` with a nil `value`,
 * `Power` with a nil first parameter), the renderer raises its own
 * `RenderError` at that exact spot — mirroring where the gem fails, which a
 * shape table cannot express. Extra fields are ignored, as constructors
 * ignore unknown keys.
 *
 * Equally deliberate non-checks, because nothing can read them: symbol-keyed
 * entries (`Object.entries` cannot see them, no renderer reads them, and no
 * Ruby hash can hold them — a hash whose only `linebreakstyle` is
 * Symbol-keyed is, for parity, a hash without that key), and values that
 * CHANGE between this walk and the render (a stateful getter or Proxy): the
 * gem re-reads its ivars at render time and honors whatever each read
 * returns, and this port does the same — a read that *throws* mid-render is
 * the renderer entry point's half of the wrap.
 */

import { describeThrown, RenderError } from "./errors";
import type { MathNode, NodeKind } from "./nodes";
import { RUBY_ABSTRACT_CLASSES } from "./nodes";
import { NODE_SPECS } from "./normalize";

/** Ruby classes whose carrier node MUST carry its identity slot. */
const ABSTRACT_CARRIERS: ReadonlySet<string> = new Set<string>(RUBY_ABSTRACT_CLASSES);

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") {
    // Best effort under a hostile input: a proxy trap or a `constructor`
    // getter can throw while the class is being NAMED, and a description
    // must never replace the rejection it decorates.
    try {
      const proto: object | null = Object.getPrototypeOf(value);
      if (proto === Object.prototype || proto === null) return "an object";
      const name = (proto as { readonly constructor?: { readonly name?: unknown } }).constructor
        ?.name;
      return typeof name === "string" && name !== ""
        ? `a ${name} instance`
        : "an instance of an anonymous class";
    } catch {
      return "an object of unreadable class";
    }
  }
  if (typeof value === "string") return JSON.stringify(value);
  return `a ${typeof value}`;
}

/**
 * The accessor-failure rejection: a read the walk performed on the input ran
 * the input's own code — a getter or proxy trap, something no Ruby ivar read
 * can do — and that code threw. The contract is RenderError-or-pass, so the
 * input's throw is wrapped, its message kept, at the path of the read — and
 * the description itself cannot throw: `describeThrown` runs the thrown
 * value's own `toString` under a fallback phrase, so a hostile
 * stringification decorates this rejection instead of replacing it.
 */
function accessorFailure(error: unknown, format: string, path: string): RenderError {
  return new RenderError(
    `${path}: reading the tree itself threw before it could be validated — ${describeThrown(error)}`,
    format,
    "unknown",
  );
}

/**
 * One property read off the input, wrapped AT THE READ SITE: whatever a
 * getter or proxy trap throws — a deliberate `RangeError` included — is the
 * input's failure and becomes the accessor-failure `RenderError` here, which
 * is what lets the entry point treat a `RangeError` that reaches it as
 * genuine stack exhaustion and nothing else.
 */
function readProperty(source: object, key: PropertyKey, format: string, path: string): unknown {
  try {
    return (source as Record<PropertyKey, unknown>)[key];
  } catch (error) {
    throw accessorFailure(error, format, path);
  }
}

/** `Object.keys`, wrapped like `readProperty`: only a proxy's ownKeys trap can throw here. */
function readOwnKeys(source: object, format: string, path: string): readonly string[] {
  try {
    return Object.keys(source);
  } catch (error) {
    throw accessorFailure(error, format, path);
  }
}

/** `Object.getPrototypeOf`, wrapped like `readProperty`: only a proxy trap can throw here. */
function readPrototype(value: object, format: string, path: string): object | null {
  try {
    return Object.getPrototypeOf(value);
  } catch (error) {
    throw accessorFailure(error, format, path);
  }
}

/**
 * Verifies that `value` is a structurally valid `MathNode` tree, throwing a
 * `RenderError` naming the offending path when it is not.
 *
 * Deliberately `() => void`, never `asserts value is MathNode`: the check is
 * structural, and the module header's "Deliberately NOT checked" list is
 * exactly the gap between passing it and BEING a `MathNode`. Ruby reads an
 * unassigned ivar as nil, so a constructed kind's required fields may be
 * absent here; boolean and number slot values pass wherever a string is
 * declared; extra fields ride along. An `asserts` signature would stamp the
 * static type onto values the runtime deliberately does not certify — an
 * unsound narrowing on the public ./core surface. A caller holding
 * `unknown` casts at its own boundary, naming this check (plus its
 * renderer's per-site guards) as what the cast leans on.
 *
 * `format` names the caller in the error (`"asciimath"`, `"latex"`, ...);
 * renderers call this once, at their entry point, and may then dispatch on
 * `kind` without re-checking shape. See the module docs for the exact
 * contract — in one line: every node has a known `kind`, abstract carriers
 * carry their `name`, and no slot holds a value no Ruby node could hold.
 */
export function assertMathNodeShape(value: unknown, format: string): void {
  try {
    assertNode(value, format, "node", new Set());
  } catch (error) {
    if (error instanceof RenderError) throw error;
    if (error instanceof RangeError) {
      // GENUINE stack exhaustion. Every read the walk performs on the input
      // is wrapped at its read site (`readProperty` and friends), and the
      // wrap's description cannot throw (`describeThrown`), so an input's
      // own throw — a getter's deliberate `RangeError` included — arrives
      // here already spelled RenderError. What remains is the walk's
      // recursion running out of frames on a finite tree (the cycle check
      // above would have named a loop). The gem's own recursion has a
      // ceiling too, but a HIGHER one — its render survives to roughly
      // 4,656 frames on default stacks before SystemStackError (probed on
      // the pinned oracle; depth 10,000 raises there as well,
      // probe-sweep-depth.rb) — so between this walk's environment-dependent
      // ceiling and the gem's sits a known parity window where the gem
      // renders and this port raises (TODO.plan/deferred.md). The message
      // says exactly that; the renderer's boundary brands its own overflow
      // with the same words (`src/formats/asciimath/renderer.ts`).
      throw new RenderError(
        "node: the tree nests too deep for the walk's call stack. The ceiling is " +
          "environment-dependent and lower than the gem's — the gem's own render " +
          "survives to roughly 4,656 frames on default stacks before " +
          "SystemStackError — so a tree in that window renders there and raises " +
          "here (TODO.plan/deferred.md)",
        format,
        "unknown",
      );
    }
    // The reads are wrapped at their sites, but an engine operation on the
    // input can still throw without one — `Array.isArray` on a revoked
    // proxy, for one. Same contract, same wrap, rooted at the entry.
    throw accessorFailure(error, format, "node");
  }
}

/**
 * Throws the cycle rejection: `value` is already on the recursion stack, so
 * walking into it again could only recurse forever. `ancestors` holds exactly
 * the objects between the root and `path` — membership is a cycle, and a
 * merely shared (diamond) object is never a member because each frame removes
 * itself on the way out.
 */
function assertNotCyclic(
  ancestors: Set<object>,
  value: object,
  format: string,
  path: string,
): void {
  if (ancestors.has(value)) {
    throw new RenderError(
      `${path}: the tree cycles — the value here is also its own ancestor, ` +
        `so no walk of it can terminate`,
      format,
      "unknown",
    );
  }
}

function assertNode(
  value: unknown,
  format: string,
  path: string,
  ancestors: Set<object>,
): asserts value is MathNode {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RenderError(
      `${path}: expected a math node, found ${describeValue(value)}`,
      format,
      "unknown",
    );
  }
  assertNotCyclic(ancestors, value, format, path);
  const kind = readProperty(value, "kind", format, `${path}.kind`);
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
    const name = readProperty(node, identity.field, format, `${path}.${identity.field}`);
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

  ancestors.add(node);
  try {
    for (const [, tsField] of spec.fields) {
      const slot = readProperty(node, tsField, format, `${path}.${tsField}`);
      // `undefined` here is Ruby's unassigned ivar — a legal, missing field.
      if (slot !== undefined) assertSlot(slot, format, kind, `${path}.${tsField}`, ancestors);
    }
  } finally {
    ancestors.delete(node);
  }
}

/**
 * One slot value, recursively. The grammar is this port's supported structural
 * representation of measured Ruby slot values: nil, strings, booleans,
 * numbers, nodes, lists of any of these, and plain hashes (options,
 * attributes — whose values get the same check, since table parens and alias
 * defaults put real nodes inside). "Plain" is enforced by prototype: any other
 * object is outside that structural mapping and is rejected rather than walked
 * as a hash.
 */
function assertSlot(
  value: unknown,
  format: string,
  kind: string,
  path: string,
  ancestors: Set<object>,
): void {
  if (value === null) return;
  const type = typeof value;
  if (type === "string" || type === "boolean" || type === "number") return;
  if (Array.isArray(value)) {
    assertNotCyclic(ancestors, value, format, path);
    ancestors.add(value);
    try {
      // An index loop, not `forEach`: `forEach` skips holes, and a hole reads
      // back as the same `undefined` an explicit entry holds — both rejected.
      // `length` and every element go through the wrapped read: only a proxy
      // or accessor element puts code behind either, and its throw is the
      // input's failure, not the walk's.
      const length = readProperty(value, "length", format, `${path}.length`);
      if (
        typeof length !== "number" ||
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > 2 ** 32 - 1
      ) {
        // A length no native array can report, so the walk refuses to make
        // it the loop's bound: trusted, an `Infinity` lie is an index loop
        // that never terminates (and 2**40 is one that might as well not) —
        // a third outcome the RenderError-or-pass contract does not have.
        // This throw is unreachable for a genuine `Array`: its `length` is
        // spec-clamped to a Uint32 — a non-negative integer at most
        // 2**32 - 1, ECMA-262 ArraySetLength refuses any other assignment
        // with a RangeError — so only a proxy or forged accessor lying
        // through the read above can land here (`Array.isArray` sees the
        // proxy's array target; the trap serves the lie). `String(length)`
        // on a primitive number runs no input code.
        throw new RenderError(
          `${path}.length: no native array length can be ` +
            `${typeof length === "number" ? String(length) : describeValue(length)} — ` +
            `a length is a non-negative integer no greater than 2**32 - 1, so only a ` +
            `proxy or accessor lying about "length" reports this, and the walk will ` +
            `not trust it as a loop bound`,
          format,
          kind,
        );
      }
      for (let index = 0; index < length; index += 1) {
        const item = readProperty(value, index, format, `${path}[${index}]`);
        assertSlot(item, format, kind, `${path}[${index}]`, ancestors);
      }
    } finally {
      ancestors.delete(value);
    }
    return;
  }
  if (type === "object") {
    const nested = readProperty(value as object, "kind", format, `${path}.kind`);
    if (typeof nested === "string" && Object.hasOwn(NODE_SPECS, nested)) {
      assertNode(value, format, path, ancestors);
      return;
    }
    if (typeof nested === "string") {
      // Node-shaped, but a kind the model does not declare: a forged or stale
      // node. `normalize` refuses the same shape for the same reason.
      throw new RenderError(`${path}: unknown node kind ${describeValue(nested)}`, format, nested);
    }
    const proto = readPrototype(value as object, format, path);
    if (proto !== Object.prototype && proto !== null) {
      // A Date, Map, Set, RegExp, or arbitrary class instance. Walking its
      // enumerable entries would usually find none and wave it through. This
      // port's supported structural object slots admit nodes and plain records;
      // a record's prototype must be `Object.prototype` or `null` to be one.
      throw new RenderError(
        `${path}: a node slot cannot hold ${describeValue(value)} — ` +
          `this port's supported structural objects are nodes and plain records`,
        format,
        kind,
      );
    }
    assertNotCyclic(ancestors, value as object, format, path);
    ancestors.add(value as object);
    try {
      // `Object.keys` then one wrapped read per key (not `Object.entries`,
      // which performs all its value reads inside one opaque call): a
      // throwing getter names the exact key it sat behind.
      for (const key of readOwnKeys(value as object, format, path)) {
        const item = readProperty(value as object, key, format, `${path}.${key}`);
        assertSlot(item, format, kind, `${path}.${key}`, ancestors);
      }
    } finally {
      ancestors.delete(value as object);
    }
    return;
  }
  // function, symbol, bigint — or an explicit `undefined` entry inside a list
  // or hash (an unassigned ivar is a missing *field*, never a present entry):
  // all outside this port's supported structural slot types.
  throw new RenderError(
    `${path}: a node slot cannot hold ${type === "undefined" ? "undefined" : `a ${type}`}`,
    format,
    kind,
  );
}
