/**
 * Maps the typed UnicodeMath model that umath-ts returns (its
 * `UmathModelDocument`) to the capture tree the UnicodeMath transform reads.
 *
 * A port of the Ruby gem's `Plurimath::UnicodeMath::Mapper` and
 * `Mapper::CaptureOrder` (plurimath main 99ebfb21). umath owns the grammar
 * and the model. Its model classes are the grammar's captures, typed: each
 * class has one attribute per capture key, and the few captures its shape
 * normalization adds are listed in `WRAPPERS`. The mapper reads a model node
 * as the capture tree it stands for, and the transform (Ruby's
 * `Mapper::Rules`, the former `UnicodeMath::Transform` unchanged) builds the
 * Formula from it. The model declares fields alphabetically; each hash of the
 * capture tree lists them in the grammar's capture order instead.
 */
import type { ParseHash, ParseValue } from "../../pegkit/index";
import { Slice } from "../../pegkit/index";

/**
 * The captures umath's shape normalization adds, and the value each one
 * stands for (umath 0.1, grammars/umath.wrappers.json): `text` the wrapped
 * text (`""` when empty); `empty` an absent optional part (`""`); `list` the
 * list (`""` when it is empty); `absent` nothing (nil).
 */
const WRAPPERS: Readonly<Record<string, "text" | "empty" | "list" | "absent">> = {
  empty: "empty",
  list: "list",
  literal: "text",
  // biome-ignore lint/style/useNamingConvention: umath's grammar names the capture `literal_2`.
  literal_2: "text",
  present: "absent",
  spelling: "text",
};

/** Filled from the symbol catalog by umath, not by the grammar. */
const SYMBOL_FIELDS: ReadonlySet<string> = new Set(["value", "kind"]);

/** A generated umath-ts model instance: its class lists its member names. */
interface ModelNode {
  readonly constructor: { readonly memberNames?: readonly string[] };
  readonly [field: string]: unknown;
}

/** The fields of one compiled grammar entry in umath-ts's artifact. */
export interface UmathGrammar {
  readonly atoms: readonly Readonly<Record<string, unknown>>[];
  readonly root: number;
}

/** umath-ts's compiled artifact (`artifacts/umath.json`), one entry per decimal marker. */
export interface UmathArtifact {
  readonly entries: Readonly<Record<string, { readonly grammar: UmathGrammar }>>;
}

/** Raised for input that holds no formula. */
export class UmathMapperError extends Error {
  override name = "UmathMapperError";
}

/** The artifact entry umath parses with for a decimal marker (`Umath::RawParser.entry_for`). */
const ENTRIES: Readonly<Record<string, string>> = { ".": "dot", ",": "comma", "٫": "arabic" };

export function artifactEntry(decimal: string): string {
  const entry = ENTRIES[decimal];
  if (entry === undefined)
    throw new RangeError(`umath has no grammar for decimal marker ${decimal}`);
  return entry;
}

type Tree = ParseValue | undefined;

function isHash(value: Tree): value is ParseHash {
  return (
    value !== null &&
    value !== undefined &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Slice)
  );
}

function isText(value: Tree): value is string | Slice {
  return typeof value === "string" || value instanceof Slice;
}

/** Parsanol `CanFlatten#merge_fold`, for the values the mapper builds. */
function mergeFold(left: ParseValue, right: ParseValue): ParseValue {
  if (isHash(left) && isHash(right)) return { ...left, ...right };
  if (Array.isArray(left) && Array.isArray(right)) return [...left, ...right];
  if (typeof left === "string" && typeof right === "string") return left + right;
  if (isText(left) && isText(right)) return right instanceof Slice ? right : left;
  if (isText(right)) return left;
  if (isText(left)) return right;
  if (Array.isArray(left) && isHash(right)) return [...left, right];
  if (isHash(left) && Array.isArray(right)) return [left, ...right];
  throw new TypeError("Unhandled case when foldr'ing sequence.");
}

/** Parsanol `CanFlatten#foldl`: nil items are skipped, an empty list is `""`. */
function foldl(list: readonly ParseValue[]): ParseValue {
  const values = list.filter((value) => value !== null);
  if (values.length === 0) return "";
  return values.slice(1).reduce(mergeFold, values[0] as ParseValue);
}

/** Parsanol `CanFlatten#flatten_repetition(list, true)`. */
function flattenRepetition(list: readonly ParseValue[]): ParseValue {
  if (list.some(isHash)) return list.filter(isHash);
  if (list.some(Array.isArray)) return list.flatMap((item) => (Array.isArray(item) ? item : []));
  if (list.length === 0) return [];
  let content: string | undefined;
  for (const item of list) {
    if (item === null) continue;
    content = (content ?? "") + (item instanceof Slice ? item.text : String(item));
  }
  return content ?? "";
}

function absent(value: unknown): boolean {
  return value === null || value === undefined || typeof value === "symbol";
}

function isModelNode(value: unknown): value is ModelNode {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray((value.constructor as { memberNames?: unknown }).memberNames)
  );
}

export class UnicodemathMapper {
  constructor(private readonly order: CaptureOrder) {}

  /** The capture tree of `document.expression`, with Slice leaves: the transform's input. */
  call(document: { readonly expression?: unknown }): ParseValue {
    const expression = document.expression;
    if (absent(expression)) throw new UmathMapperError("UnicodeMath input has no formula");
    return slices(this.captures(expression, this.order.rootCapture) ?? null);
  }

  private captures(node: unknown, capture: string): ParseValue {
    if (Array.isArray(node))
      return flattenRepetition(node.map((item) => this.captures(item, capture)));
    if (isModelNode(node)) return this.fold(this.nodeFields(node, capture));
    if (absent(node)) return null;
    if (typeof node !== "string")
      throw new TypeError(`unexpected umath model value ${typeof node}`);
    return node;
  }

  private nodeFields(node: ModelNode, capture: string): [string, ParseValue][] {
    let names = [...(node.constructor.memberNames as readonly string[])];
    if (names.includes("spelling")) names = names.filter((name) => !SYMBOL_FIELDS.has(name));
    names = names.filter((name) => !absent(node[name]));
    return this.order.order(capture, names).map((name) => [name, this.captures(node[name], name)]);
  }

  /** Ordinary captures form hash parts; each wrapper is the value it stands for. */
  private fold(fields: readonly [string, ParseValue][]): ParseValue {
    if (!fields.some(([name]) => Object.hasOwn(WRAPPERS, name))) return hashOf(fields);
    const parts: ParseValue[] = [];
    let run: [string, ParseValue][] | null = null;
    let onlyAbsent = true;
    for (const [name, value] of fields) {
      const kind = Object.hasOwn(WRAPPERS, name) ? WRAPPERS[name] : undefined;
      if (kind === undefined) {
        onlyAbsent = false;
        run ??= [];
        run.push([name, value]);
        continue;
      }
      if (run) parts.push(hashOf(run));
      run = null;
      onlyAbsent &&= kind === "absent";
      parts.push(wrapped(kind, value));
    }
    if (run) parts.push(hashOf(run));
    if (onlyAbsent) return null;
    return foldl(parts);
  }
}

function hashOf(fields: readonly [string, ParseValue][]): ParseHash {
  const hash: ParseHash = {};
  for (const [name, value] of fields) hash[name] = value;
  return hash;
}

function wrapped(kind: "text" | "empty" | "list" | "absent", value: ParseValue): ParseValue {
  switch (kind) {
    case "text":
      return value === null || (Array.isArray(value) && value.length === 0) ? "" : value;
    case "empty":
      return "";
    case "list":
      return Array.isArray(value) && value.length === 0 ? "" : value;
    default:
      return null;
  }
}

/** Captured text becomes Slice text, which the transform tells apart from built values. */
function slices(tree: ParseValue): ParseValue {
  if (typeof tree === "string") return new Slice(tree, 0);
  if (Array.isArray(tree)) return tree.map(slices);
  if (isHash(tree)) {
    const out: ParseHash = {};
    for (const [key, value] of Object.entries(tree)) out[key] = slices(value);
    return out;
  }
  return tree;
}

type Order = readonly string[];
const BLANK: ReadonlyMap<string, Order> = new Map([["", []]]);
const NONE: ReadonlyMap<string, Order> = new Map();

function union(...sets: ReadonlyMap<string, Order>[]): Map<string, Order> {
  const out = new Map<string, Order>();
  for (const set of sets) for (const [key, value] of set) out.set(key, value);
  return out;
}

/**
 * The order in which the grammar captures a node's fields
 * (`Mapper::CaptureOrder`). For a node captured as `capture` with the fields
 * `names`, every way the grammar can capture exactly those names under
 * `capture` is listed, skipping any branch that captures another name. When
 * they all give one order, that is the order; when the grammar allows more
 * than one, the allowed order nearest the declared one is used.
 */
export class CaptureOrder {
  private static readonly cache = new WeakMap<UmathGrammar, CaptureOrder>();

  static for(grammar: UmathGrammar): CaptureOrder {
    let order = CaptureOrder.cache.get(grammar);
    if (order === undefined) {
      order = new CaptureOrder(grammar);
      CaptureOrder.cache.set(grammar, order);
    }
    return order;
  }

  readonly rootCapture: string;
  private readonly atoms: readonly Readonly<Record<string, unknown>>[];
  private readonly named = new Map<string, number[]>();
  private readonly listCache = new Map<string, ReadonlyMap<string, Order>>();
  private readonly itemCache = new Map<string, ReadonlyMap<string, Order>>();
  private readonly orders = new Map<string, Order>();
  private readonly visiting = new Set<string>();

  private constructor(grammar: UmathGrammar) {
    this.atoms = grammar.atoms;
    const root = this.body(grammar.root);
    if (root.type !== "Named") throw new TypeError("umath grammar root is not a named capture");
    this.rootCapture = String(root.body.name);
    this.atoms.forEach((atom) => {
      const named = atom.Named as { name: string; atom: number } | undefined;
      if (named === undefined) return;
      const list = this.named.get(named.name) ?? [];
      list.push(named.atom);
      this.named.set(named.name, list);
    });
  }

  /** `names` (the node's set fields) in the order the grammar captures them under `capture`. */
  order(capture: string, names: readonly string[]): Order {
    if (names.length < 2) return names;
    const key = `${capture}\u0000${names.join("\u0000")}`;
    let order = this.orders.get(key);
    if (order === undefined) {
      order = this.find(capture, names);
      this.orders.set(key, order);
    }
    return order;
  }

  private body(index: number): { type: string; body: Record<string, unknown> } {
    const atom = this.atoms[index];
    if (atom === undefined) throw new TypeError(`umath grammar has no atom ${index}`);
    const [type, body] = Object.entries(atom)[0] as [string, Record<string, unknown>];
    return { type, body };
  }

  private find(capture: string, names: readonly string[]): Order {
    const wanted = [...names].sort();
    const found = new Map<string, Order>();
    for (const atom of this.named.get(capture) ?? []) {
      for (const [k, v] of this.lists(atom, wanted)) found.set(k, v);
      for (const [k, v] of this.items(atom, wanted, new Set())) found.set(k, v);
    }
    const orders = [...found.values()].filter((list) => list.length === wanted.length);
    if (orders.length === 0) return names;
    const declared = new Map(names.map((name, i) => [name, i]));
    const rank = (list: Order) => list.map((name) => declared.get(name) as number);
    let best = orders[0] as Order;
    for (const list of orders.slice(1)) {
      const a = rank(list);
      const b = rank(best);
      const i = a.findIndex((value, j) => value !== b[j]);
      if (i >= 0 && (a[i] as number) < (b[i] as number)) best = list;
    }
    return best;
  }

  private lists(index: number, wanted: Order): ReadonlyMap<string, Order> {
    const key = `${index}\u0000${wanted.join("\u0000")}`;
    const cached = this.listCache.get(key);
    if (cached !== undefined) return cached;
    if (this.visiting.has(key)) return BLANK;
    // A rule reached again inside itself is a repetition written as
    // recursion (spaces and the like); it adds no captures there.
    this.visiting.add(key);
    const result = this.compute(index, wanted);
    this.visiting.delete(key);
    this.listCache.set(key, result);
    return result;
  }

  private compute(index: number, wanted: Order): ReadonlyMap<string, Order> {
    const { type, body } = this.body(index);
    switch (type) {
      case "Named": {
        const name = String(body.name);
        return wanted.includes(name) ? new Map([[name, [name]]]) : NONE;
      }
      case "Entity":
        return this.lists(body.atom as number, wanted);
      case "Alternative":
        return union(...(body.atoms as number[]).map((atom) => this.lists(atom, wanted)));
      case "Sequence":
        return this.sequence(body.atoms as number[], wanted);
      case "Repetition":
        // A repetition of captures is a list, whose items are hashes of their
        // own; only an optional part adds to this hash.
        return body.tag === "Maybe" ? union(BLANK, this.lists(body.atom as number, wanted)) : BLANK;
      default:
        return BLANK;
    }
  }

  /** A sequence folds its parts' hashes left to right; a name met again keeps its first place. */
  private sequence(parts: readonly number[], wanted: Order): ReadonlyMap<string, Order> {
    let acc: ReadonlyMap<string, Order> = BLANK;
    for (const part of parts) {
      const later = this.lists(part, wanted);
      if (later.size === 0) return NONE;
      const next = new Map<string, Order>();
      for (const left of acc.values()) {
        for (const right of later.values()) {
          const joined = [...left];
          for (const name of right) if (!joined.includes(name)) joined.push(name);
          next.set(joined.join("\u0000"), joined);
        }
      }
      acc = next;
    }
    return acc;
  }

  /** The capture orders of the items when atom `index` captures a list. */
  private items(index: number, wanted: Order, seen: Set<number>): ReadonlyMap<string, Order> {
    const key = `${index}\u0000${wanted.join("\u0000")}`;
    const cached = this.itemCache.get(key);
    if (cached !== undefined) return cached;
    if (seen.has(index)) return NONE;
    seen.add(index);
    const { type, body } = this.body(index);
    let result: ReadonlyMap<string, Order>;
    switch (type) {
      case "Entity":
        result = this.items(body.atom as number, wanted, seen);
        break;
      case "Alternative":
      case "Sequence":
        result = union(...(body.atoms as number[]).map((atom) => this.items(atom, wanted, seen)));
        break;
      case "Repetition":
        result =
          body.tag === "Maybe"
            ? this.items(body.atom as number, wanted, seen)
            : this.lists(body.atom as number, wanted);
        break;
      default:
        result = NONE;
    }
    this.itemCache.set(key, result);
    return result;
  }
}
