/**
 * `split_on_linebreak` (ARCHITECTURE.md §5): the gem's `Formula#new_line_support`
 * and every `line_breaking` it calls, on the pinned oracle (plurimath 0.11.6,
 * `00c52783`) — `math/formula.rb:317-347`, `math/core.rb:258-296` and
 * `:476-481`, the 44 per-class overrides under `math/function/`, and
 * `Linebreak#omml_line_break` (`function/linebreak.rb:74`).
 *
 * The gem does not build a new tree: it walks a deep clone and MUTATES it,
 * moving what follows a `Linebreak` into an accumulator formula (`obj`) and
 * re-running on that accumulator until nothing is left. So this is a
 * transliteration of a mutating algorithm, not a design of a splitter, and it
 * keeps the gem's aliasing on purpose — `updated_object_values` leaves a node's
 * own slot pointing at the accumulator, and a later step reads it back. Every
 * oddity in the gem's output (a `Sqrt` that loses its wrapper on a nested
 * break, a `Fenced` that is only split at the top level of its content, a
 * `Td` whose break becomes a table) is reproduced rather than repaired: the
 * point of this module is byte parity with what the gem emits, and the specs in
 * `spec/plurimath/{mathml,omml}/line_breaks_spec.rb` pin those oddities.
 *
 * Format-blind by construction: the result is a list of formula nodes, one per
 * line, and each renderer renders them itself. That is why it lives in `core`
 * (layer 1, imports nothing else in `src/`) — two formats need the same walk,
 * and §3 rule 4 forbids one importing the other.
 *
 * The walk works on private mutable copies (`clone`) of the public immutable
 * nodes; the caller's tree is never touched. Where Ruby would raise
 * `NoMethodError` (a `nil` where the gem calls `.line_breaking` without `&.`, a
 * bare String in a formula's value) this throws a `TypeError`, which the
 * renderers' boundary reports as their own `RenderError` — the gem's own
 * `wrap_render_error` does the same to its `NoMethodError`.
 */

import {
  AbsNode,
  BarNode,
  BaseNode,
  BinaryFunctionNode,
  CeilNode,
  ColorNode,
  DdotNode,
  DotNode,
  FencedNode,
  FloorNode,
  FontStyleNode,
  FormulaNode,
  FracNode,
  HatNode,
  IntNode,
  LinebreakNode,
  type MathNode,
  MpaddedNode,
  MrowNode,
  NaryNode,
  NormNode,
  NumberNode,
  ObraceNode,
  OintNode,
  OverleftrightarrowNode,
  OversetNode,
  ProdNode,
  SqrtNode,
  SumNode,
  SymbolNode,
  TableNode,
  TernaryFunctionNode,
  TextNode,
  TildeNode,
  UbraceNode,
  UlNode,
  UnaryFunctionNode,
  UndersetNode,
  VecNode,
} from "./nodes";

/** A node under the walk: the public shape, but writable and reference-shared. */
interface Node {
  kind: string;
  name?: string;
  [field: string]: unknown;
}

/** Every node the walk created or cloned. `Mglyph`'s attribute hash is not in it, whatever its keys. */
const OWN = new WeakSet<object>();

type Construct = new (init: Record<string, unknown>) => Node;

const CONSTRUCTORS: { readonly [kind: string]: Construct } = {
  abs: AbsNode as unknown as Construct,
  bar: BarNode as unknown as Construct,
  base: BaseNode as unknown as Construct,
  binaryFunction: BinaryFunctionNode as unknown as Construct,
  ceil: CeilNode as unknown as Construct,
  color: ColorNode as unknown as Construct,
  ddot: DdotNode as unknown as Construct,
  dot: DotNode as unknown as Construct,
  fenced: FencedNode as unknown as Construct,
  floor: FloorNode as unknown as Construct,
  fontStyle: FontStyleNode as unknown as Construct,
  formula: FormulaNode as unknown as Construct,
  frac: FracNode as unknown as Construct,
  hat: HatNode as unknown as Construct,
  int: IntNode as unknown as Construct,
  linebreak: LinebreakNode as unknown as Construct,
  mpadded: MpaddedNode as unknown as Construct,
  mrow: MrowNode as unknown as Construct,
  nary: NaryNode as unknown as Construct,
  norm: NormNode as unknown as Construct,
  number: NumberNode as unknown as Construct,
  obrace: ObraceNode as unknown as Construct,
  oint: OintNode as unknown as Construct,
  overleftrightarrow: OverleftrightarrowNode as unknown as Construct,
  overset: OversetNode as unknown as Construct,
  prod: ProdNode as unknown as Construct,
  sqrt: SqrtNode as unknown as Construct,
  sum: SumNode as unknown as Construct,
  symbol: SymbolNode as unknown as Construct,
  table: TableNode as unknown as Construct,
  ternaryFunction: TernaryFunctionNode as unknown as Construct,
  text: TextNode as unknown as Construct,
  tilde: TildeNode as unknown as Construct,
  ubrace: UbraceNode as unknown as Construct,
  ul: UlNode as unknown as Construct,
  unaryFunction: UnaryFunctionNode as unknown as Construct,
  underset: UndersetNode as unknown as Construct,
  vec: VecNode as unknown as Construct,
};

/**
 * The slots that can hold a node or a list of nodes, in the order Ruby assigns
 * them (`variables` is `instance_variables`, which is assignment order:
 * `parameter_one…four` first — or `value` for `Table` — then parens, then the
 * option hashes). The order is observable: `updated_object_values` empties
 * every slot after the one it moves.
 */
const NODE_SLOTS: readonly string[] = [
  "value",
  "parameterOne",
  "parameterTwo",
  "parameterThree",
  "parameterFour",
  "openParen",
  "closeParen",
];

/** Slots that carry data but never a node; copied by reference, as Ruby does. */
const DATA_SLOTS: readonly string[] = [
  "options",
  "attributes",
  "lang",
  "hideFunctionName",
  "leftRightWrapper",
  "displaystyle",
  "display",
  "inputString",
  "isMrow",
];

const ALL_SLOTS: readonly string[] = [...NODE_SLOTS, ...DATA_SLOTS];

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && OWN.has(value);
}

/** Ruby's `Array(x)`: nil is empty, an Array is itself, anything else is wrapped. */
function toArray(value: unknown): unknown[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** `Array#flatten.compact`. */
function flattenCompact(list: readonly unknown[]): unknown[] {
  return list.flat(Number.POSITIVE_INFINITY).filter((item) => item !== null && item !== undefined);
}

/** Ruby truthiness: only nil and false are falsy. */
function truthy(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

function describe(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (Array.isArray(value)) return "an Array";
  return typeof value === "object" ? "a Hash" : `a ${typeof value}`;
}

/** Builds a node the way `Class.new` does, then writes `fields` straight in (no copying). */
function make(kind: string, name: string | undefined, fields: Record<string, unknown> = {}): Node {
  const Ctor = CONSTRUCTORS[kind];
  if (Ctor === undefined) throw new TypeError(`no constructor for node kind "${kind}"`);
  const node = new Ctor({ name, ...fields });
  for (const [slot, value] of Object.entries(fields)) node[slot] = value;
  OWN.add(node);
  return node;
}

/** `self.class.new(...)` — same kind, same alias name. */
function spawn(self: Node, fields: Record<string, unknown> = {}): Node {
  return make(self.kind, self.name, fields);
}

function isFormula(node: Node): boolean {
  return node.kind === "formula" || node.kind === "mrow";
}

function isNamed(value: unknown, kind: string, name: string): boolean {
  return isNode(value) && value.kind === kind && value.name === name;
}

/**
 * `Formula.new(value)` and its subclasses: a bare `Left` first element turns
 * `left_right_wrapper` off (`formula.rb:44`).
 */
function newFormulaLike(self: Node | undefined, value: unknown[]): Node {
  const formula = self === undefined ? make("formula", undefined) : spawn(self);
  formula.value = value;
  if (isNamed(value[0], "unaryFunction", "Left")) formula.leftRightWrapper = false;
  return formula;
}

/** `Utility.filter_values(array_or_formula)` with the default `new_formula: true`. */
function filterValues(input: unknown): unknown {
  let list: unknown[];
  if (Array.isArray(input)) list = flattenCompact(input);
  else if (isNode(input) && isFormula(input)) list = toArray(input.value);
  else return input;
  if (list.length > 1) return newFormulaLike(undefined, list);
  return list[0] ?? null;
}

/** `Formula#update`. */
function updateValue(formula: Node, object: unknown): void {
  formula.value = flattenCompact(toArray(object));
}

function valueExists(formula: Node): boolean {
  const value = formula.value;
  return Array.isArray(value) && value.length > 0;
}

/** `Formula#insert`. */
function insertValues(formula: Node, values: unknown[]): void {
  updateValue(formula, toArray(formula.value).concat(values));
}

/**
 * Fresh copy of `source`'s fields into `copy` (`clone`) or the same nodes
 * adopted (`adopt`). Every own field is carried — a symbol's `id`, a number's
 * base — and only the node-bearing slots are walked.
 */
function copySlots(source: Node, copy: Node, viaClone: boolean): void {
  for (const [slot, value] of Object.entries(source)) {
    if (slot === "kind" || slot === "name" || value === undefined) continue;
    // `Mglyph` keeps an attribute hash where every other unary function keeps a node.
    const isNodeSlot = NODE_SLOTS.includes(slot) && !(source.name === "Mglyph" && slot !== "value");
    copy[slot] = isNodeSlot ? copyValue(value, viaClone) : value;
  }
}

function copyValue(value: unknown, viaClone: boolean): unknown {
  if (Array.isArray(value)) return value.map((item) => copyValue(item, viaClone));
  if (typeof value !== "object" || value === null) return value;
  if (viaClone && !isNode(value)) return value;
  const source = value as Node;
  if (typeof source.kind !== "string" || !Object.hasOwn(CONSTRUCTORS, source.kind)) return value;
  return copyNode(source, viaClone);
}

/** `Core#cloned_objects` / `Formula#cloned_objects`; with `viaClone` false, adopts a public tree. */
function copyNode(node: Node, viaClone: boolean): Node {
  const copy = make(node.kind, node.name);
  if (isFormula(node)) {
    // `value.map(&:cloned_objects)`: a bare String in a formula's value has no such method.
    copy.value = toArray(node.value).map((item) => {
      if (viaClone) return copyNode(need(item, "cloned_objects"), true);
      return copyValue(item, false);
    });
    copy.leftRightWrapper = node.leftRightWrapper;
    return copy;
  }
  copySlots(node, copy, viaClone);
  return copy;
}

/** The slots a node carries, in Ruby's assignment order (`Core#variables`). */
function variables(node: Node): string[] {
  return ALL_SLOTS.filter((slot) => Object.hasOwn(node, slot) && node[slot] !== undefined);
}

/** A node the walk may call `line_breaking` on; Ruby's NoMethodError otherwise. */
function need(value: unknown, what: string): Node {
  if (!isNode(value)) {
    throw new TypeError(`undefined method for ${describe(value)} (${what})`);
  }
  return value;
}

/** `Core#result`: the node's own `@value` when it has one, else the given list, cut after each Linebreak. */
function result(node: Node, given: unknown): unknown[][] {
  const own = node.value;
  const list = truthy(own) ? own : given;
  if (!Array.isArray(list)) {
    throw new TypeError(`undefined method 'slice_after' for ${describe(list)}`);
  }
  const slices: unknown[][] = [];
  let current: unknown[] = [];
  for (const item of list) {
    current.push(item);
    if (isNode(item) && item.kind === "linebreak") {
      slices.push(current);
      current = [];
    }
  }
  if (current.length > 0) slices.push(current);
  return slices;
}

/** `Linebreak#omml_line_break`: drops the break from the first slice and puts its glyph on one side. */
function ommlLineBreak(slices: unknown[][]): unknown[][] {
  const first = slices[0] as unknown[];
  const breaker = need(first[first.length - 1], "omml_line_break");
  first.pop();
  const one = breaker.parameterOne;
  const exists = Array.isArray(one) ? one.length > 0 : one !== null && one !== undefined;
  if (!exists) return slices;
  const attributes = breaker.attributes;
  if (attributes === null || attributes === undefined) {
    throw new TypeError("undefined method '[]' for nil (Linebreak#attributes)");
  }
  if ((attributes as Record<string, unknown>).linebreakstyle === "after") {
    (slices[0] as unknown[]).push(one);
  } else {
    (slices[1] as unknown[]).unshift(one);
  }
  return slices;
}

type Handler = (self: Node, obj: Node) => void;

/** The receiver's own `line_breaking`: its per-class override, else `Core`'s. */
function lineBreaking(target: unknown, obj: Node): void {
  const node = need(target, "line_breaking");
  if (isFormula(node)) {
    formulaLineBreaking(node, obj);
    return;
  }
  const handler = HANDLERS[handlerKey(node)];
  if (handler === undefined) genericLineBreaking(node, obj);
  else handler(node, obj);
}

/** `parameter&.line_breaking(obj)`. */
function optional(target: unknown, obj: Node): void {
  if (target === null || target === undefined) return;
  lineBreaking(target, obj);
}

function handlerKey(node: Node): string {
  if (
    node.kind === "binaryFunction" ||
    node.kind === "ternaryFunction" ||
    node.kind === "unaryFunction"
  ) {
    return `${node.kind}:${node.name}`;
  }
  return node.kind;
}

/** `Formula#line_breaking`. */
function formulaLineBreaking(formula: Node, obj: Node): void {
  const slices = result(formula, []);
  if (slices.length > 1) {
    const broken = ommlLineBreak(slices);
    updateValue(formula, toArray(broken.shift()));
    updateValue(obj, broken.flat(Number.POSITIVE_INFINITY));
    // `reprocess_value`
    const fresh = spawn(formula, { value: [] });
    formulaLineBreaking(formula, fresh);
    if (valueExists(fresh)) {
      const value = obj.value as unknown[];
      value.unshift(make("linebreak", undefined));
      value.unshift(newFormulaLike(formula, fresh.value as unknown[]));
    }
    return;
  }

  const value = toArray(formula.value);
  for (const [index, item] of value.entries()) {
    lineBreaking(item, obj);
    if (valueExists(obj)) {
      // `break obj.insert(value.slice!(index..value.size))`: `slice!` empties the tail in place.
      insertValues(obj, value.splice(index + 1));
      break;
    }
  }
}

/** `Core#array_line_break_field`. */
function arrayLineBreakField(node: Node, field: unknown, slot: string, obj: Node): void {
  if (result(node, field).length > 1) {
    updatedObjectValues(node, slot, obj, false);
    return;
  }
  for (const item of field as unknown[]) lineBreaking(item, obj);
}

/** `Core#line_breaking`. */
function genericLineBreaking(node: Node, obj: Node): void {
  for (const slot of variables(node)) {
    const field = node[slot];
    if (isNode(field)) {
      lineBreaking(field, obj);
      if (valueExists(obj)) updatedObjectValues(node, slot, obj, true);
    } else if (Array.isArray(field)) {
      arrayLineBreakField(node, field, slot, obj);
    }
  }
}

/**
 * `Core#updated_object_values`. Moves `param` and every slot after it into a
 * fresh node of the same class, which `obj` then holds.
 */
function updatedObjectValues(node: Node, param: string, obj: Node, updating: boolean): void {
  const object = spawn(node);
  let found = false;
  for (const slot of variables(node)) {
    let value: unknown;
    if (param === slot) {
      found = true;
      if (updating) {
        value = obj.value;
        obj.value = [];
      } else {
        const formula = newFormulaLike(undefined, node[slot] as unknown[]);
        formulaLineBreaking(formula, obj);
        node[slot] = obj;
        value = obj;
      }
    } else {
      value = node[slot];
      if (found) node[slot] = null;
    }
    object[slot] = filterValues(value);
  }
  if (Object.hasOwn(object, "hideFunctionName")) object.hideFunctionName = true;
  updateValue(obj, object);
}

/** `UnaryFunction#custom_array_line_breaking` — `Longdiv`, `Phantom`, `Msgroup`. */
function customArrayLineBreaking(node: Node, obj: Node): void {
  const slices = result(node, node.parameterOne);
  if (slices.length > 1) {
    const broken = ommlLineBreak(slices);
    node.parameterOne = toArray(broken.shift());
    updateValue(obj, spawn(node, { parameterOne: broken.flat(Number.POSITIVE_INFINITY) }));
    // `reprocess_parameter_one`
    const fresh = newFormulaLike(undefined, []);
    customArrayLineBreaking(node, fresh);
    if (valueExists(fresh)) {
      const value = obj.value as unknown[];
      value.unshift(make("linebreak", undefined));
      value.unshift(spawn(node, { parameterOne: fresh.value }));
    }
    return;
  }

  const list = node.parameterOne as unknown[];
  for (const [index, item] of list.entries()) {
    lineBreaking(item, obj);
    if (valueExists(obj)) {
      insertValues(obj, list.splice(index + 1));
      break;
    }
  }
}

/** Abs, Ceil, Floor, Norm: the piece after the break reopens the delimiter. */
const delimited: Handler = (self, obj) => {
  lineBreaking(self.parameterOne, obj);
  if (valueExists(obj)) {
    const reopened = spawn(self, { parameterOne: filterValues(obj.value) });
    reopened.openParen = true;
    reopened.closeParen = false;
    updateValue(obj, reopened);
    self.closeParen = true;
    if (!truthy(self.openParen)) self.openParen = false;
  }
};

/** Bar, Ddot, Dot, Obrace, Overleftrightarrow, Sqrt, Tilde, Ubrace, Vec: only the inside survives. */
const unwrapping: Handler = (self, obj) => {
  optional(self.parameterOne, obj);
  if (valueExists(obj)) updateValue(obj, filterValues(obj.value));
};

/** Log, Semantics: the first parameter moves, the second stays with the tail. */
function headMoves(hide: boolean): Handler {
  return (self, obj) => {
    optional(self.parameterOne, obj);
    if (!valueExists(obj)) return;
    const moved = spawn(self, {
      parameterOne: filterValues(obj.value),
      parameterTwo: self.parameterTwo,
    });
    self.parameterTwo = null;
    if (hide) moved.hideFunctionName = true;
    updateValue(obj, moved);
  };
}

/** `Power`, `Stackrel` and the `Sum` shape without a limits branch: one break site, `parameter_one`. */
function firstOnly(strict: boolean): Handler {
  return (self, obj) => {
    if (strict) lineBreaking(self.parameterOne, obj);
    else optional(self.parameterOne, obj);
    if (!valueExists(obj)) return;
    updateValue(
      obj,
      spawn(self, { parameterOne: filterValues(obj.value), parameterTwo: self.parameterTwo }),
    );
    self.parameterTwo = null;
  };
}

/** Base, Underset: `parameter_one`, else `parameter_two`, no function-name flag. */
const oneThenTwo: Handler = (self, obj) => {
  optional(self.parameterOne, obj);
  if (valueExists(obj)) {
    updateValue(
      obj,
      spawn(self, { parameterOne: filterValues(obj.value), parameterTwo: self.parameterTwo }),
    );
    self.parameterTwo = null;
    return;
  }
  optional(self.parameterTwo, obj);
  if (valueExists(obj)) {
    updateValue(obj, spawn(self, { parameterOne: null, parameterTwo: filterValues(obj.value) }));
  }
};

/** Frac, Over, Mod: like `oneThenTwo`, with the function name hidden on the pieces. */
function hidingOneThenTwo(kind: "frac" | "over" | "mod"): Handler {
  return (self, obj) => {
    optional(self.parameterOne, obj);
    if (valueExists(obj)) {
      const head = spawn(self, {
        parameterOne: filterValues(obj.value),
        parameterTwo: self.parameterTwo,
      });
      // frac.rb:105, mod.rb:78-80 and over.rb:65 differ in who is hidden.
      if (kind === "frac") head.hideFunctionName = true;
      if (kind === "mod") {
        head.hideFunctionName = false;
        self.hideFunctionName = true;
      }
      updateValue(obj, head);
      self.parameterTwo = null;
      if (kind === "over") self.hideFunctionName = true;
      return;
    }
    optional(self.parameterTwo, obj);
    if (valueExists(obj)) {
      const tail = spawn(self, { parameterOne: null, parameterTwo: filterValues(obj.value) });
      tail.hideFunctionName = true;
      updateValue(obj, tail);
    }
  };
}

/** Sum, Int, Oint, Prod: the operator moves with its limits, hidden. */
function bigOperator(clearLimits: boolean): Handler {
  return (self, obj) => {
    optional(self.parameterOne, obj);
    if (valueExists(obj)) {
      const moved = spawn(self, {
        parameterOne: filterValues(obj.value),
        parameterTwo: self.parameterTwo,
        parameterThree: self.parameterThree,
      });
      moved.hideFunctionName = true;
      updateValue(obj, moved);
      if (clearLimits) {
        self.parameterTwo = null;
        self.parameterThree = null;
      }
      return;
    }
    optional(self.parameterThree, obj);
    if (valueExists(obj)) updateValue(obj, filterValues(obj.value));
  };
}

/** Lim, Inf: the argument moves under a limit-less `Underover`. */
const limitLike: Handler = (self, obj) => {
  lineBreaking(self.parameterOne, obj);
  if (valueExists(obj)) {
    updateValue(
      obj,
      make("ternaryFunction", "Underover", {
        parameterOne: null,
        parameterTwo: filterValues(obj.value),
        parameterThree: self.parameterTwo,
      }),
    );
    self.parameterTwo = null;
  }
};

const limits: Handler = (self, obj) => {
  optional(self.parameterOne, obj);
  if (valueExists(obj)) {
    updateValue(
      obj,
      spawn(self, {
        parameterOne: filterValues(obj.value),
        parameterTwo: self.parameterTwo,
        parameterThree: self.parameterThree,
      }),
    );
    self.parameterTwo = null;
    self.parameterThree = null;
    return;
  }
  optional(self.parameterTwo, obj);
  if (valueExists(obj)) {
    updateValue(
      obj,
      spawn(self, {
        parameterOne: null,
        parameterTwo: filterValues(obj.value),
        parameterThree: self.parameterThree,
      }),
    );
    self.parameterThree = null;
  }
};

const nary: Handler = (self, obj) => {
  optional(self.parameterOne, obj);
  if (valueExists(obj)) {
    updateValue(
      obj,
      spawn(self, {
        parameterOne: filterValues(obj.value),
        parameterTwo: self.parameterTwo,
        parameterThree: self.parameterThree,
        parameterFour: self.parameterFour,
        options: self.options,
      }),
    );
    self.parameterTwo = null;
    self.parameterThree = null;
    self.parameterFour = null;
    return;
  }
  optional(self.parameterTwo, obj);
  if (valueExists(obj)) {
    updateValue(
      obj,
      spawn(self, {
        parameterOne: null,
        parameterTwo: filterValues(obj.value),
        parameterThree: self.parameterThree,
        parameterFour: self.parameterFour,
        options: self.options,
      }),
    );
    self.parameterThree = null;
    self.parameterFour = null;
    return;
  }
  optional(self.parameterFour, obj);
  if (valueExists(obj)) updateValue(obj, filterValues(obj.value));
};

const overset: Handler = (self, obj) => {
  optional(self.parameterTwo, obj);
  if (valueExists(obj)) {
    updateValue(
      obj,
      spawn(self, { parameterOne: self.parameterOne, parameterTwo: filterValues(obj.value) }),
    );
    self.parameterOne = null;
  }
};

const hat: Handler = (self, obj) => {
  optional(self.parameterOne, obj);
  if (valueExists(obj)) {
    updateValue(
      obj,
      make("overset", undefined, { parameterOne: filterValues(obj.value), parameterTwo: null }),
    );
  }
};

const fontStyle: Handler = (self, obj) => {
  optional(self.parameterOne, obj);
  if (!valueExists(obj)) return;
  updateValue(
    obj,
    spawn(self, { parameterOne: filterValues(obj.value), parameterTwo: self.parameterTwo }),
  );
};

/** PowerBase: first parameter, else the (strictly non-nil) second. */
const powerBase: Handler = (self, obj) => {
  optional(self.parameterOne, obj);
  if (valueExists(obj)) {
    updateValue(
      obj,
      spawn(self, {
        parameterOne: filterValues(obj.value),
        parameterTwo: self.parameterTwo,
        parameterThree: self.parameterThree,
      }),
    );
    self.parameterTwo = null;
    self.parameterThree = null;
    return;
  }
  lineBreaking(self.parameterTwo, obj);
  if (valueExists(obj)) {
    updateValue(
      obj,
      spawn(self, {
        parameterOne: null,
        parameterTwo: filterValues(obj.value),
        parameterThree: self.parameterThree,
      }),
    );
    self.parameterThree = null;
  }
};

const underover: Handler = (self, obj) => {
  optional(self.parameterOne, obj);
  if (valueExists(obj)) {
    updateValue(
      obj,
      make("ternaryFunction", "Underover", {
        parameterOne: filterValues(obj.value),
        parameterTwo: self.parameterTwo,
        parameterThree: self.parameterThree,
      }),
    );
    self.parameterTwo = null;
    self.parameterThree = null;
    return;
  }
  lineBreaking(self.parameterTwo, obj);
  if (valueExists(obj)) {
    updateValue(
      obj,
      make("ternaryFunction", "Underover", {
        parameterOne: null,
        parameterTwo: filterValues(obj.value),
        parameterThree: self.parameterThree,
      }),
    );
    self.parameterTwo = null;
    self.parameterThree = null;
  }
};

const multiscript: Handler = (self, obj) => {
  optional(self.parameterOne, obj);
  if (valueExists(obj)) {
    updateValue(
      obj,
      spawn(self, {
        parameterOne: filterValues(obj.value),
        parameterTwo: self.parameterTwo,
        parameterThree: self.parameterThree,
      }),
    );
    self.parameterTwo = null;
    self.parameterThree = null;
    return;
  }
  arrayLineBreakField(self, self.parameterTwo, "parameterTwo", obj);
  if (valueExists(obj)) {
    updateValue(
      obj,
      spawn(self, {
        parameterOne: null,
        parameterTwo: obj.value,
        parameterThree: self.parameterThree,
      }),
    );
    self.parameterThree = null;
  }
};

/** `Td`: a break in the cell becomes a one-column table of one row per line. */
const td: Handler = (self) => {
  const slices = result(self, toArray(self.parameterOne));
  if (slices.length <= 1) return;
  const lines = ommlLineBreak(slices);
  const rows = lines.map((line) =>
    make("unaryFunction", "Tr", {
      parameterOne: [make("binaryFunction", "Td", { parameterOne: line })],
    }),
  );
  self.parameterOne = [make("table", undefined, { value: rows })];
};

/** `Fenced`: split only at a break directly inside `parameter_two`; the tail is a clone without the open paren. */
const fenced: Handler = (self, obj) => {
  const slices = result(self, toArray(self.parameterTwo));
  if (slices.length <= 1) return;
  const tail = copyNode(self, true);
  const broken = ommlLineBreak(slices);
  self.parameterTwo = toArray(broken.shift());
  tail.parameterOne = null;
  tail.parameterTwo = broken.flat(Number.POSITIVE_INFINITY);
  self.parameterThree = null;
  updateValue(obj, tail);
};

const HANDLERS: { readonly [key: string]: Handler } = {
  abs: delimited,
  ceil: delimited,
  floor: delimited,
  norm: delimited,
  bar: unwrapping,
  ddot: unwrapping,
  dot: unwrapping,
  obrace: unwrapping,
  overleftrightarrow: unwrapping,
  sqrt: unwrapping,
  tilde: unwrapping,
  ubrace: unwrapping,
  vec: unwrapping,
  base: oneThenTwo,
  underset: oneThenTwo,
  frac: hidingOneThenTwo("frac"),
  fenced,
  fontStyle,
  hat,
  int: bigOperator(true),
  nary,
  oint: bigOperator(true),
  overset,
  prod: bigOperator(false),
  sum: bigOperator(true),
  "binaryFunction:Inf": limitLike,
  "binaryFunction:Lim": limitLike,
  "binaryFunction:Log": headMoves(true),
  "binaryFunction:Mod": hidingOneThenTwo("mod"),
  "binaryFunction:Over": hidingOneThenTwo("over"),
  "binaryFunction:Power": firstOnly(false),
  "binaryFunction:Semantics": headMoves(false),
  "binaryFunction:Stackrel": firstOnly(true),
  "binaryFunction:Td": td,
  "ternaryFunction:Limits": limits,
  "ternaryFunction:Multiscript": multiscript,
  "ternaryFunction:PowerBase": powerBase,
  "ternaryFunction:Underover": underover,
  "unaryFunction:Longdiv": customArrayLineBreaking,
  "unaryFunction:Msgroup": customArrayLineBreaking,
  "unaryFunction:Phantom": customArrayLineBreaking,
};

/** `Formula#new_line_support` on a chain longer than this is a runaway, not a document. */
const MAX_LINES = 10_000;

/**
 * The formulas one `to_mathml` / `to_omml` call renders under
 * `split_on_linebreak`: `Formula#new_line_support`. The first is a clone of the
 * receiver with everything from its first break removed; each following one
 * holds what was moved, split again in turn.
 */
export function splitOnLinebreak(node: MathNode): MathNode[] {
  const start = copyNode(node as unknown as Node, false);
  if (!isFormula(start)) throw new TypeError("split_on_linebreak needs a Formula or Mrow");
  const lines: Node[] = [];
  let current = start;
  for (;;) {
    if (lines.length >= MAX_LINES) {
      throw new RangeError(`split_on_linebreak did not converge in ${MAX_LINES} lines`);
    }
    const cloned = copyNode(current, true);
    const rest = spawn(current, { value: [] });
    lineBreaking(cloned, rest);
    lines.push(cloned);
    if (!valueExists(rest)) return lines as unknown as MathNode[];
    current = rest;
  }
}
