/**
 * The node model (ARCHITECTURE.md §5), declared from `corpus/census.yaml`.
 *
 * Structure only: fields, a `readonly kind` discriminant, and `equals`. No
 * render methods, no parse logic, and no imports from another layer — `core`
 * is layer 1 (§3, rule 1). The two tables under `./generated/` are core's own
 * data, under core's own directory, which that rule makes part of the layer.
 * The Ruby-shaped serialization lives in `./normalize`.
 *
 * **The equality projection lives here, not in `./equality`.** §4 promises
 * `node.equals(other)` as a *method*, which means the node classes need the
 * projection at construction time; `./equality` would then have to import
 * `./nodes` for its types and `./nodes` import `./equality` for the method — a
 * cycle the boundaries gate rejects. So the implementation sits at the bottom
 * of this file, behind a private base class, and `./equality` keeps the
 * module-level facade (`equals(a, b)`) that a bundler can drop.
 *
 * **Two node types, because §4 and §5 promise two different things.**
 * `ConstructedMathNode` is the union of the classes — instances, which carry
 * `equals()`. `MathNode` is the same union as *data*, derived from it by
 * dropping that member, and it is what everything structural takes: a plain
 * object with the right fields is a `MathNode` without ever meeting a
 * constructor, which is §5's structural-dispatch promise. One type cannot be
 * both: a union of classes rejects a plain object for want of `equals`.
 * This mirrors Ruby, where the node's comparison belongs to the instance and a
 * same-shape Hash does not get it — measured against the gem, not assumed:
 *
 * ```text
 * node instance responds to == : true
 * same-shape Hash is a Number  : false
 * Number.new(2) == that Hash   : false
 * hash.method(:==).owner       : Hash          (not Math::Number)
 * hash.value                   : NoMethodError
 * ```
 *
 * (A Hash does respond to *some* `==` — every Ruby object does. What it does
 * not have is the node's `==` or any of its accessors, which is the half the
 * split reproduces.)
 *
 * `test/core/node-types.spec.ts` holds the compile-time fixture for both
 * directions; a runtime test cannot see either of them break.
 *
 * **The union is closed and census-complete.** Every `implemented` census
 * entry has a class here, including kinds no landed format produces yet:
 * widening an exported exhaustive union after publication breaks consumers,
 * so membership locks once, at 1.0, not incrementally.
 *
 * **Aliased Ruby classes are represented as their alias target plus a name.**
 * The census classifies 1552 classes as `aliased` — they add no field and no
 * equality of their own. `Math::Symbols::Plus` is `SymbolNode { id: "Plus" }`;
 * `Math::Function::Sin` is `UnaryFunctionNode { name: "Sin" }`. That is why the
 * three Ruby-abstract family roots are concrete classes here: they are the
 * carriers for 67 aliased function classes. No abstract *base* is a
 * union member, which is what §5 rules out.
 *
 * **Publicly immutable** (decided 2026-07-28): `readonly` fields, no setters,
 * no runtime freeze — frozen → editable stays a non-breaking change later,
 * the reverse never is. `readonly` is compile-time only; the enforced promise
 * is that the library never mutates a tree after `parse` returns.
 *
 * **Constructors are public and permissive.** They do not validate: an
 * invalid hand-built tree fails at render with `RenderError`, never a raw
 * `TypeError`. They shallow-copy array and options arguments, so a caller's
 * later `push` or key assignment cannot reach into a finished node. Nested
 * objects the caller placed inside are not deep-cloned — mutating those is
 * out of contract.
 *
 * A field is `undefined` when Ruby never assigned the instance variable and
 * `null` when Ruby assigned `nil`. The distinction is load-bearing: Ruby
 * serializes assigned-`nil` and omits unassigned, so `./normalize` needs it.
 * `./equality` deliberately treats the two as the same, because an unset
 * Ruby ivar reads back as `nil` through its accessor.
 *
 * **Constructors therefore materialize Ruby's constructor defaults**, from
 * `defaults.assigned` in `corpus/census.yaml`: `new NumberNode({ value: "2" })`
 * carries `base: null, miniSubSized: false, miniSupSized: false`, because
 * `Plurimath::Math::Number.new("2")` assigns all four. A field in a class's
 * `defaults.unassigned` stays `undefined` — `hide_function_name` everywhere,
 * `input_string` on a formula (the parser sets it afterwards), and everything
 * but `value` on a symbol, whose `initialize` guards each remaining
 * assignment. The types say which is which: an always-assigned field has no
 * `| undefined` in its declaration.
 *
 * Ruby's assignment is often conditional and not consistent between
 * siblings — `Underset` stores an empty options hash where `Overset` skips
 * it — so the default set is measured by the generator, never inferred.
 */

import { XHTML1_ENTITY_CODEPOINTS } from "./generated/html-entities";
import { SYMBOL_CANONICAL_VALUES } from "./generated/symbol-canonical";
import { rubyNumberToS, rubyUnreproducible } from "./ruby-semantics";

/** A node's options or attributes hash. Ruby symbol keys arrive as strings. */
export type NodeOptions = Readonly<Record<string, unknown>>;

/**
 * What a `parameter_*`, paren or base slot may hold. Deliberately wide: Ruby
 * puts a node, a list of nodes, a bare string or a hash in these slots
 * depending on the class — `Text` holds a string, `Td` holds a list, and
 * `Mglyph#initialize(parameter_one = {})` holds an attribute hash, which the
 * census records as `parameter_one: {}` and the MathML renderer spreads
 * straight onto the element. The hash member is why this is not just
 * "node | list | string".
 */
export type NodeParameter = MathNode | readonly MathNode[] | string | NodeOptions | null;

/** Ruby's `value` on `Formula`, `Mrow` and `Table`: an ordered node list. */
/**
 * Ruby's `value` on `Formula`, `Mrow` and `Table`: an ordered list of nodes —
 * and occasionally a bare string beside them. Measured: the gem parses
 * `left(right)` to `[Left, "", Right]`, the empty string being Parslet's fold
 * of an all-vanished sequence. A strings-free type here would be a wish, not
 * a fact, and it forced a cast in the transform that hid exactly this.
 */
export type NodeSequence = readonly (MathNode | string)[];

/**
 * Ruby classes the census marks abstract. Recorded, never union members —
 * three of them are also `implemented`, and those appear here as the
 * concrete alias carriers described in the module docs.
 */
export const RUBY_ABSTRACT_CLASSES = [
  "Math::Function::BinaryFunction",
  "Math::Function::TernaryFunction",
  "Math::Function::UnaryFunction",
  "Math::Symbols::Paren",
] as const;

/**
 * A slot Ruby's `initialize` leaves alone when it is not given one. Omitting
 * the argument leaves the field `undefined`, which `./normalize` omits.
 * Shallow-copies a list argument so a caller's later `push` cannot reach in.
 */
/**
 * A node this package constructed, as opposed to node-shaped data.
 *
 * Reads the brand a constructor set (see `NODE_BRAND`) rather than testing
 * shape or prototype, both of which a caller's value can imitate.
 */
function isConstructedNode(value: object): boolean {
  return (value as { [NODE_BRAND]?: unknown })[NODE_BRAND] === true;
}

/**
 * Shallow-copies anything a caller may still hold a reference to: every list
 * and every object except a constructed node, which is immutable and whose
 * identity is worth keeping.
 *
 * **This copying is a deliberate divergence from the gem** (§5). Ruby copies
 * nothing — `Formula.new(array).value.equal?(array)` is `true`, and a caller's
 * later `push` reaches straight into the node. Ruby can afford that because its
 * nodes are mutable by design; ours are `readonly`, and a `readonly` field a
 * caller can still change through their own reference is a promise we would be
 * breaking silently. No output can tell the two apart, so parity is unaffected.
 *
 * The copy is one level deep, as §5 states: a caller mutating something nested
 * inside what they passed is out of contract.
 */
function copySlot(value: NodeParameter): NodeParameter {
  if (Array.isArray(value)) return [...value];
  if (typeof value === "object" && value !== null && !isConstructedNode(value)) {
    return { ...(value as NodeOptions) };
  }
  return value;
}

/** A slot Ruby's `initialize` leaves alone when it is not given one. */
function copyParameter(value: NodeParameter | undefined): NodeParameter | undefined {
  return value === undefined ? undefined : copySlot(value);
}

function copyOptions(value: NodeOptions | undefined): NodeOptions | undefined {
  return value === undefined ? undefined : { ...value };
}

/**
 * A slot Ruby's `initialize` assigns unconditionally, defaulting to `nil` —
 * or to `fallback` where the Ruby default is something else (`Text` starts
 * `parameter_one` at `""`). Omitting the argument materializes that value, so
 * the node carries the field set a freshly built Ruby object carries.
 */
function assignedParameter(
  value: NodeParameter | undefined,
  fallback: NodeParameter = null,
): NodeParameter {
  return copySlot(value === undefined ? fallback : value);
}

/** A hash slot Ruby's `initialize` assigns unconditionally, defaulting to `{}`. */
function assignedOptions(value: NodeOptions | undefined): NodeOptions {
  return value === undefined ? {} : { ...value };
}

/** A node-list slot Ruby's `initialize` assigns unconditionally. */
function assignedSequence(
  value: NodeSequence | null | undefined,
  fallback: NodeSequence | null,
): NodeSequence | null {
  if (value === undefined) return fallback;
  return value === null ? null : [...value];
}

/** A string slot Ruby's `initialize` assigns unconditionally, defaulting to `nil`. */
function assignedValue(value: string | null | undefined): string | null {
  return value === undefined ? null : value;
}

/**
 * `Symbols::Symbol#initialize` (`symbols/symbol.rb:12`):
 *
 *   @value = sym.is_a?(Array) ? sym.join : sym&.to_s
 *
 * The symbol slot COERCES, unlike the two other users of `assignedValue`:
 * `Number#initialize` converts only a `Parslet::Slice` and stores anything else
 * as-is, so they cannot share one helper.
 *
 * Ruby needs this because it is untyped and Parslet hands it slices and arrays.
 * This port declares the slot `string | null`, and a reviewer traced every
 * producer on the AsciiMath parse path: `newSymbolOfClass` passes `value: null`
 * and `newBareSymbol` passes a string, so nothing real reaches the other
 * branches. An earlier version of this comment claimed the opposite — that a
 * cast in `transform.ts` made arrays reachable — which was inferred from the
 * cast rather than traced to its producers, and was wrong.
 *
 * So the coercion is kept for the cases it can reproduce EXACTLY, and refuses
 * the rest rather than inventing a string. Two rounds of review were spent on
 * invented strings here: a plain object became `"[object Object]"` inside an
 * array, and once that was "fixed" a Range became `"{toString: ...}"` and a
 * Struct `"{x: 1, y: \"x\"}"` where the gem gives `"1..3"` and
 * `"#<struct ...>"`. Ruby's `to_s` on an arbitrary object cannot be reproduced
 * in JavaScript, so the honest answer is to refuse loudly.
 *
 * A `TypeError` and not a `PlurimathError`: this fires only on a value the
 * declared type already forbids, which is a caller type violation rather than a
 * parse or render failure, and the error contract's codes are for the latter.
 */
function symbolValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  // `Array#join` calls `to_s` on each element and concatenates with no
  // separator, recursing into nested arrays; a nil element contributes "".
  // Measured: `["x", [1, 2], "y"].join` is "x12y", `["x", nil, "y"].join` "xy".
  if (Array.isArray(value)) return value.map((entry) => symbolValue(entry) ?? "").join("");
  if (typeof value === "string") return value;

  const why = rubyUnreproducible(value);
  if (why !== null) {
    throw new TypeError(
      `Symbols::Symbol#initialize coerces its argument with to_s, and ${why} — ` +
        "pass a string or null (src/core/ruby-semantics.ts)",
    );
  }

  if (typeof value === "number") return rubyNumberToS(value) as string;
  return String(value);
}

/**
 * The starting value for a slot: the aliased class's own default when it has
 * one, otherwise the carrier's.
 *
 * An explicit `undefined` check, not `??`, because an alias is allowed to
 * default a slot to `null` where the carrier defaults it to something else —
 * `??` would silently prefer the carrier there.
 */
function aliasFallback<T>(alias: T | undefined, carrier: T): T {
  return alias === undefined ? carrier : alias;
}

/* -------------------------------------------------------------------------
 * Aliased classes with their own constructor defaults.
 *
 * 21 of the 1,552 aliased census classes override `initialize` with defaults
 * their carrier does not have: 8 `FontStyle::*` put their family name in
 * `parameter_two`, 10 `Table::*` bring a bracket pair, `Td` and `Tr` start
 * `parameter_one` at `[]`, and `Mglyph` starts it at `{}`. The carrier node
 * is one class for all of them, so it looks the alias up by identity and
 * materializes what Ruby would have assigned.
 *
 * Four rules, all load-bearing:
 *
 * 1. **Keyed by `(kind, name)`, never by `name` alone.** Alias names are not
 *    globally unique across carriers.
 * 2. **Materialized only where the caller omitted the field.** An explicit
 *    `null`, `false`, `[]` or `{}` survives — that is `assignedParameter`'s
 *    `undefined` check, not `??`.
 * 3. **Fresh values per construction**, which is why the table holds thunks.
 *    `Matrix`'s parens are nested nodes and `Td`'s parameter is an array; one
 *    shared frozen table would leak state between nodes.
 * 4. **An unknown name keeps the carrier's defaults.** Construction stays
 *    permissive and never throws (§5), so a name the gem does not have builds
 *    exactly like the bare carrier.
 *
 * Every value below is the census's `defaults.assigned` for that class,
 * transcribed — and the census measured it by instantiating the class, which
 * is the only way to get it right here: `Bmatrix#initialize` reads
 * `open_paren = "["`, a **string**, and `Table#initialize` then runs it
 * through `Utility.symbols_class(open_paren, lang: :unicodemath)`. What the
 * object ends up holding is a `Paren::Lsquare` node. Source-reading would have
 * stored `"["`.
 * ---------------------------------------------------------------------- */

interface AliasConstructorDefaults {
  readonly closeParen?: NodeParameter;
  readonly openParen?: NodeParameter;
  readonly options?: NodeOptions;
  readonly parameterOne?: NodeParameter;
  readonly parameterTwo?: NodeParameter;
  readonly value?: NodeSequence | null;
}

/**
 * Shared, and safe to share because it is never handed out: callers only read
 * absent keys off it, and every value they do get comes from a thunk.
 */
const NO_ALIAS_DEFAULTS: AliasConstructorDefaults = {};

/** `Utility.symbols_class("[", lang: :unicodemath)` and friends, as nodes. */
const paren = (id: string): SymbolNode => new SymbolNode({ id: `Paren::${id}` });
/** What `symbols_class` returns for a string no symbol class claims. */
const literalParen = (value: string): SymbolNode => new SymbolNode({ value });

const ALIAS_CONSTRUCTOR_DEFAULTS: ReadonlyMap<string, () => AliasConstructorDefaults> = new Map<
  string,
  () => AliasConstructorDefaults
>([
  // `FontStyle::*` — `initialize(parameter_one, parameter_two = "<family>")`.
  ["fontStyle::Bold", () => ({ parameterOne: null, parameterTwo: "bold" })],
  ["fontStyle::DoubleStruck", () => ({ parameterOne: null, parameterTwo: "double-struck" })],
  ["fontStyle::Fraktur", () => ({ parameterOne: null, parameterTwo: "fraktur" })],
  ["fontStyle::Italic", () => ({ parameterOne: null, parameterTwo: "italic" })],
  ["fontStyle::Monospace", () => ({ parameterOne: null, parameterTwo: "monospace" })],
  // "rm", not "normal": the family string is the one the renderers emit.
  ["fontStyle::Normal", () => ({ parameterOne: null, parameterTwo: "rm" })],
  ["fontStyle::SansSerif", () => ({ parameterOne: null, parameterTwo: "sans-serif" })],
  ["fontStyle::Script", () => ({ parameterOne: null, parameterTwo: "script" })],
  // `Table::*` — a bracket pair each, coerced to symbol nodes by `Table`.
  // Six of the ten demand `value` positionally, so the census measured them
  // with a nil there; that matches the carrier's own default either way.
  [
    "table::Align",
    () => ({ closeParen: paren("Rsquare"), openParen: paren("Lsquare"), options: {}, value: null }),
  ],
  [
    "table::Array",
    () => ({ closeParen: paren("Rsquare"), openParen: paren("Lsquare"), options: {}, value: [] }),
  ],
  [
    "table::Bmatrix",
    () => ({ closeParen: paren("Rsquare"), openParen: paren("Lsquare"), options: {}, value: null }),
  ],
  [
    "table::Cases",
    () => ({
      closeParen: literalParen(":}"),
      openParen: paren("Lcurly"),
      options: {},
      value: [],
    }),
  ],
  [
    "table::Eqarray",
    () => ({
      closeParen: literalParen(""),
      openParen: literalParen(""),
      options: {},
      value: [],
    }),
  ],
  [
    "table::Matrix",
    () => ({ closeParen: paren("Rround"), openParen: paren("Lround"), options: {}, value: [] }),
  ],
  [
    "table::Multline",
    () => ({ closeParen: paren("Rsquare"), openParen: paren("Lsquare"), options: {}, value: null }),
  ],
  [
    "table::Pmatrix",
    () => ({ closeParen: paren("Rround"), openParen: paren("Lround"), options: {}, value: null }),
  ],
  [
    "table::Split",
    () => ({ closeParen: paren("Rsquare"), openParen: paren("Lsquare"), options: {}, value: null }),
  ],
  // Two separate `Vert` nodes, not one shared instance.
  [
    "table::Vmatrix",
    () => ({ closeParen: paren("Vert"), openParen: paren("Vert"), options: {}, value: null }),
  ],
  // `Td#initialize` wraps its argument in `Array(...)`, so nil becomes `[]`.
  ["binaryFunction::Td", () => ({ parameterOne: [], parameterTwo: null })],
  ["unaryFunction::Tr", () => ({ parameterOne: [] })],
  // The one parameter slot holding a hash rather than a node or a list.
  ["unaryFunction::Mglyph", () => ({ parameterOne: {} })],
]);

/**
 * The defaults for one carrier identity, freshly built, or none.
 *
 * Lookup is `(kind, name)`: `Td` is a `binaryFunction` and `Tr` a
 * `unaryFunction`, and nothing stops two carriers from having like-named
 * aliases, so the kind is part of the key rather than an afterthought.
 */
function aliasDefaults(kind: NodeKind, name: string | undefined): AliasConstructorDefaults {
  if (name === undefined) return NO_ALIAS_DEFAULTS;
  const build = ALIAS_CONSTRUCTOR_DEFAULTS.get(`${kind}::${name}`);
  return build === undefined ? NO_ALIAS_DEFAULTS : build();
}

/**
 * The one thing every node class shares: `equals` as a method (§4).
 *
 * Deliberately not exported and deliberately empty otherwise — nodes are not
 * an extension point (§5), and a base carrying state would put a field on
 * every node that Ruby does not have. The method only forwards to the module
 * function below, so an object that merely *looks* like a node — the
 * structural dispatch §5 requires — gets the same answer through
 * `equals(a, b)` without inheriting anything.
 *
 * Extending it is what makes a class a `ConstructedMathNode`; everything that
 * only needs the fields takes `MathNode` instead.
 */
/**
 * Marks an object as built by a node constructor.
 *
 * Module-private, and deliberately not from the global registry. A
 * `Symbol.for()` key is readable by anyone, so a caller could set it on an
 * ordinary hash and have that hash treated as a node — which is the guarantee
 * this exists to provide, handed straight back.
 *
 * The cost is that a node built by a *second copy* of this package carries a
 * different symbol and is not recognised, so it gets copied rather than kept by
 * reference. That is the safe direction to fail: an unnecessary shallow copy
 * behaves identically, whereas trusting an unrecognised value would let a
 * caller reach into a finished node.
 *
 * Four narrower tests were tried and each was defeated. `instanceof` fails
 * across module copies. A `kind` key fails because `kind` is a real `mglyph`
 * attribute. An `equals` method fails because `NodeOptions` admits arbitrary
 * values, a function among them. A global symbol fails as above.
 */
const NODE_BRAND: unique symbol = Symbol("plurimath.node");

class NodeBase {
  /** @internal Not part of the public shape; see `NODE_BRAND`. */
  readonly [NODE_BRAND] = true as const;

  equals(other: unknown): boolean {
    return nodeEquals(this as unknown as MathNode, other);
  }
}

export interface AbsInit {
  readonly closeParen?: NodeParameter | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly openParen?: NodeParameter | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Abs`.
 */
export class AbsNode extends NodeBase {
  readonly kind = "abs" as const;
  readonly closeParen: NodeParameter | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly openParen: NodeParameter | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: AbsInit = {}) {
    super();
    this.closeParen = copyParameter(init.closeParen);
    this.hideFunctionName = init.hideFunctionName;
    this.openParen = copyParameter(init.openParen);
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

export interface BarInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Bar`.
 */
export class BarNode extends NodeBase {
  readonly kind = "bar" as const;
  readonly attributes: NodeOptions;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: BarInit = {}) {
    super();
    this.attributes = assignedOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

export interface BaseInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Base`.
 */
export class BaseNode extends NodeBase {
  readonly kind = "base" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter;
  readonly parameterTwo: NodeParameter;

  constructor(init: BaseInit = {}) {
    super();
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = assignedParameter(init.parameterOne);
    this.parameterTwo = assignedParameter(init.parameterTwo);
  }
}

export interface BinaryFunctionInit {
  /** Ruby class basename under `Math::Function` (14 aliased classes share this shape). */
  readonly name: string;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::BinaryFunction` — the carrier for its 14 aliased subclasses.
 *
 * Abstract in Ruby, concrete here. Those 14 classes add no field and no
 * equality of their own, so the port represents each as this node plus the
 * Ruby class basename in `name`: `Power` (`x^2`) is
 * `new BinaryFunctionNode({ name: "Power", ... })`. No abstract *base* is a union
 * member, which is what ARCHITECTURE.md §5 rules out.
 */
export class BinaryFunctionNode extends NodeBase {
  readonly kind = "binaryFunction" as const;
  readonly name: string;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter;
  readonly parameterTwo: NodeParameter;

  constructor(init: BinaryFunctionInit) {
    super();
    const alias = aliasDefaults("binaryFunction", init.name);
    this.name = init.name;
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = assignedParameter(
      init.parameterOne,
      aliasFallback(alias.parameterOne, null),
    );
    this.parameterTwo = assignedParameter(
      init.parameterTwo,
      aliasFallback(alias.parameterTwo, null),
    );
  }
}

export interface CeilInit {
  readonly closeParen?: NodeParameter | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly openParen?: NodeParameter | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Ceil`.
 */
export class CeilNode extends NodeBase {
  readonly kind = "ceil" as const;
  readonly closeParen: NodeParameter | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly openParen: NodeParameter | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: CeilInit = {}) {
    super();
    this.closeParen = copyParameter(init.closeParen);
    this.hideFunctionName = init.hideFunctionName;
    this.openParen = copyParameter(init.openParen);
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

export interface ColorInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Color`.
 */
export class ColorNode extends NodeBase {
  readonly kind = "color" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter;
  readonly parameterTwo: NodeParameter;

  constructor(init: ColorInit = {}) {
    super();
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = assignedParameter(init.parameterOne);
    this.parameterTwo = assignedParameter(init.parameterTwo);
  }
}

export interface DdotInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Ddot`.
 */
export class DdotNode extends NodeBase {
  readonly kind = "ddot" as const;
  readonly attributes: NodeOptions;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: DdotInit = {}) {
    super();
    this.attributes = assignedOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

export interface DotInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Dot`.
 */
export class DotNode extends NodeBase {
  readonly kind = "dot" as const;
  readonly attributes: NodeOptions;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: DotInit = {}) {
    super();
    this.attributes = assignedOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

export interface FencedInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterThree?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Fenced`.
 */
export class FencedNode extends NodeBase {
  readonly kind = "fenced" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions;
  readonly parameterOne: NodeParameter;
  readonly parameterThree: NodeParameter;
  readonly parameterTwo: NodeParameter;

  constructor(init: FencedInit = {}) {
    super();
    this.hideFunctionName = init.hideFunctionName;
    this.options = assignedOptions(init.options);
    this.parameterOne = assignedParameter(init.parameterOne);
    this.parameterThree = assignedParameter(init.parameterThree);
    this.parameterTwo = assignedParameter(init.parameterTwo);
  }
}

export interface FloorInit {
  readonly closeParen?: NodeParameter | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly openParen?: NodeParameter | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Floor`.
 */
export class FloorNode extends NodeBase {
  readonly kind = "floor" as const;
  readonly closeParen: NodeParameter | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly openParen: NodeParameter | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: FloorInit = {}) {
    super();
    this.closeParen = copyParameter(init.closeParen);
    this.hideFunctionName = init.hideFunctionName;
    this.openParen = copyParameter(init.openParen);
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

export interface FontStyleInit {
  /** Ruby subclass basename under `Math::Function::FontStyle`; omitted for `Math::Function::FontStyle` itself. */
  readonly name?: string | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::FontStyle`.
 *
 * Also carries the 14 census classes that alias it; their basename
 * travels in `name`.
 *
 * Eight of those aliases override `initialize` to default `parameter_two` to
 * their family name — `Bold` to `"bold"`, `Normal` to `"rm"`. Naming one is
 * enough to get it: `new FontStyleNode({ name: "Bold" })` carries
 * `parameterTwo: "bold"`, as `FontStyle::Bold.new(nil)` does. Any other name,
 * and the bare carrier's `nil` defaults stand.
 */
export class FontStyleNode extends NodeBase {
  readonly kind = "fontStyle" as const;
  readonly name: string | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter;
  readonly parameterTwo: NodeParameter;

  constructor(init: FontStyleInit = {}) {
    super();
    const alias = aliasDefaults("fontStyle", init.name);
    this.name = init.name;
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = assignedParameter(
      init.parameterOne,
      aliasFallback(alias.parameterOne, null),
    );
    this.parameterTwo = assignedParameter(
      init.parameterTwo,
      aliasFallback(alias.parameterTwo, null),
    );
  }
}

export interface FormulaInit {
  /** Ruby subclass basename under `Math::Formula`; omitted for `Math::Formula` itself. */
  readonly name?: string | undefined;
  readonly display?: string | null | undefined;
  readonly displaystyle?: boolean | undefined;
  readonly inputString?: string | null | undefined;
  readonly leftRightWrapper?: boolean | undefined;
  readonly value?: NodeSequence | null | undefined;
}

/**
 * `Math::Formula`.
 *
 * Also carries the 1 census classes that alias it; their basename
 * travels in `name`.
 */
export class FormulaNode extends NodeBase {
  readonly kind = "formula" as const;
  readonly name: string | undefined;
  readonly display: string | null | undefined;
  readonly displaystyle: boolean;
  readonly inputString: string | null | undefined;
  readonly leftRightWrapper: boolean;
  readonly value: NodeSequence | null;

  constructor(init: FormulaInit = {}) {
    super();
    this.name = init.name;
    this.display = init.display;
    this.displaystyle = init.displaystyle ?? true;
    // `Formula#initialize` never touches `@input_string` or `@display`; the
    // parser sets the first afterwards, which is why they stay `undefined`
    // here even though the corpus shows them on a parsed formula.
    this.inputString = init.inputString;
    this.leftRightWrapper = init.leftRightWrapper ?? true;
    this.value = assignedSequence(init.value, []);
  }
}

export interface FracInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Frac`.
 */
export class FracNode extends NodeBase {
  readonly kind = "frac" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter;
  readonly parameterTwo: NodeParameter;

  constructor(init: FracInit = {}) {
    super();
    this.hideFunctionName = init.hideFunctionName;
    // `Frac#initialize` stores options only when non-empty; `Underset`, with
    // the same signature, stores them always. Ruby is not consistent here and
    // the census records each class as measured.
    this.options = copyOptions(init.options);
    this.parameterOne = assignedParameter(init.parameterOne);
    this.parameterTwo = assignedParameter(init.parameterTwo);
  }
}

export interface HatInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Hat`.
 */
export class HatNode extends NodeBase {
  readonly kind = "hat" as const;
  readonly attributes: NodeOptions;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: HatInit = {}) {
    super();
    this.attributes = assignedOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

export interface IntInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterThree?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Int`.
 */
export class IntNode extends NodeBase {
  readonly kind = "int" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter;
  readonly parameterThree: NodeParameter;
  readonly parameterTwo: NodeParameter;

  constructor(init: IntInit = {}) {
    super();
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = assignedParameter(init.parameterOne);
    this.parameterThree = assignedParameter(init.parameterThree);
    this.parameterTwo = assignedParameter(init.parameterTwo);
  }
}

export interface LinebreakInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Linebreak`.
 */
export class LinebreakNode extends NodeBase {
  readonly kind = "linebreak" as const;
  readonly attributes: NodeOptions;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: LinebreakInit = {}) {
    super();
    this.attributes = assignedOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

export interface MpaddedInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Mpadded`.
 */
export class MpaddedNode extends NodeBase {
  readonly kind = "mpadded" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: MpaddedInit = {}) {
    super();
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

export interface MrowInit {
  readonly display?: string | null | undefined;
  readonly displaystyle?: boolean | undefined;
  readonly inputString?: string | null | undefined;
  readonly isMrow?: boolean | undefined;
  readonly leftRightWrapper?: boolean | undefined;
  readonly value?: NodeSequence | null | undefined;
}

/**
 * `Math::Formula::Mrow`.
 */
export class MrowNode extends NodeBase {
  readonly kind = "mrow" as const;
  readonly display: string | null | undefined;
  readonly displaystyle: boolean;
  readonly inputString: string | null | undefined;
  readonly isMrow: boolean;
  readonly leftRightWrapper: boolean;
  readonly value: NodeSequence | null;

  constructor(init: MrowInit = {}) {
    super();
    this.display = init.display;
    this.displaystyle = init.displaystyle ?? true;
    this.inputString = init.inputString;
    this.isMrow = init.isMrow ?? true;
    this.leftRightWrapper = init.leftRightWrapper ?? true;
    this.value = assignedSequence(init.value, []);
  }
}

export interface NaryInit {
  readonly options?: NodeOptions | undefined;
  readonly parameterFour?: NodeParameter | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterThree?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Nary`.
 */
export class NaryNode extends NodeBase {
  readonly kind = "nary" as const;
  readonly options: NodeOptions;
  readonly parameterFour: NodeParameter;
  readonly parameterOne: NodeParameter;
  readonly parameterThree: NodeParameter;
  readonly parameterTwo: NodeParameter;

  constructor(init: NaryInit = {}) {
    super();
    this.options = assignedOptions(init.options);
    this.parameterFour = assignedParameter(init.parameterFour);
    this.parameterOne = assignedParameter(init.parameterOne);
    this.parameterThree = assignedParameter(init.parameterThree);
    this.parameterTwo = assignedParameter(init.parameterTwo);
  }
}

export interface NormInit {
  readonly closeParen?: NodeParameter | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly openParen?: NodeParameter | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Norm`.
 */
export class NormNode extends NodeBase {
  readonly kind = "norm" as const;
  readonly closeParen: NodeParameter | undefined;
  readonly hideFunctionName: boolean | undefined;
  readonly openParen: NodeParameter | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: NormInit = {}) {
    super();
    this.closeParen = copyParameter(init.closeParen);
    this.hideFunctionName = init.hideFunctionName;
    this.openParen = copyParameter(init.openParen);
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

export interface NumberInit {
  /** Ruby stores `nil` or an Integer radix (2, 8, 16) — never a node. */
  readonly base?: number | null | undefined;
  readonly miniSubSized?: boolean | undefined;
  readonly miniSupSized?: boolean | undefined;
  readonly value?: string | null | undefined;
}

/**
 * `Math::Number`.
 */
export class NumberNode extends NodeBase {
  readonly kind = "number" as const;
  readonly base: number | null;
  readonly miniSubSized: boolean;
  readonly miniSupSized: boolean;
  readonly value: string | null;

  constructor(init: NumberInit = {}) {
    super();
    // A number needs no slot copying — the value is a primitive.
    this.base = init.base ?? null;
    this.miniSubSized = init.miniSubSized ?? false;
    this.miniSupSized = init.miniSupSized ?? false;
    this.value = assignedValue(init.value);
  }
}

export interface ObraceInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Obrace`.
 */
export class ObraceNode extends NodeBase {
  readonly kind = "obrace" as const;
  readonly attributes: NodeOptions;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: ObraceInit = {}) {
    super();
    this.attributes = assignedOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

export interface OintInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterThree?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Oint`.
 */
export class OintNode extends NodeBase {
  readonly kind = "oint" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter;
  readonly parameterThree: NodeParameter;
  readonly parameterTwo: NodeParameter;

  constructor(init: OintInit = {}) {
    super();
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = assignedParameter(init.parameterOne);
    this.parameterThree = assignedParameter(init.parameterThree);
    this.parameterTwo = assignedParameter(init.parameterTwo);
  }
}

export interface OverleftrightarrowInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Overleftrightarrow`.
 */
export class OverleftrightarrowNode extends NodeBase {
  readonly kind = "overleftrightarrow" as const;
  readonly attributes: NodeOptions;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: OverleftrightarrowInit = {}) {
    super();
    this.attributes = assignedOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

export interface OversetInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Overset`.
 */
export class OversetNode extends NodeBase {
  readonly kind = "overset" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter;
  readonly parameterTwo: NodeParameter;

  constructor(init: OversetInit = {}) {
    super();
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = assignedParameter(init.parameterOne);
    this.parameterTwo = assignedParameter(init.parameterTwo);
  }
}

export interface ProdInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterThree?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Prod`.
 */
export class ProdNode extends NodeBase {
  readonly kind = "prod" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter;
  readonly parameterThree: NodeParameter;
  readonly parameterTwo: NodeParameter;

  constructor(init: ProdInit = {}) {
    super();
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = assignedParameter(init.parameterOne);
    this.parameterThree = assignedParameter(init.parameterThree);
    this.parameterTwo = assignedParameter(init.parameterTwo);
  }
}

export interface SqrtInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Sqrt`.
 */
export class SqrtNode extends NodeBase {
  readonly kind = "sqrt" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: SqrtInit = {}) {
    super();
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

export interface SumInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterThree?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Sum`.
 */
export class SumNode extends NodeBase {
  readonly kind = "sum" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly parameterOne: NodeParameter;
  readonly parameterThree: NodeParameter;
  readonly parameterTwo: NodeParameter;

  constructor(init: SumInit = {}) {
    super();
    this.hideFunctionName = init.hideFunctionName;
    this.options = copyOptions(init.options);
    this.parameterOne = assignedParameter(init.parameterOne);
    this.parameterThree = assignedParameter(init.parameterThree);
    this.parameterTwo = assignedParameter(init.parameterTwo);
  }
}

export interface SymbolInit {
  /** Ruby class key under `Math::Symbols` — `"Plus"`, `"Paren::Lround"`. Defaults to `"Symbol"`, the base class. */
  readonly id?: string | undefined;
  readonly miniSubSized?: boolean | undefined;
  readonly miniSupSized?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly slashed?: boolean | undefined;
  readonly value?: string | null | undefined;
}

/**
 * `Math::Symbols::Symbol`.
 *
 * Also carries the 1460 census classes that alias it; their basename
 * travels in `id`.
 */
export class SymbolNode extends NodeBase {
  readonly kind = "symbol" as const;
  readonly id: string;
  readonly miniSubSized: boolean | undefined;
  readonly miniSupSized: boolean | undefined;
  readonly options: NodeOptions | undefined;
  readonly slashed: boolean | undefined;
  readonly value: string | null;

  constructor(init: SymbolInit = {}) {
    super();
    this.id = init.id ?? "Symbol";
    // `Symbol#initialize` guards every assignment but `@value`: a falsy
    // `slashed`, a `false` mini-sizing flag and an empty options hash all
    // leave the instance variable unset, so a bare symbol serializes with
    // `value` alone.
    this.miniSubSized = init.miniSubSized;
    this.miniSupSized = init.miniSupSized;
    this.options = copyOptions(init.options);
    this.slashed = init.slashed;
    this.value = symbolValue(init.value);
  }
}

export interface TableInit {
  /** Ruby subclass basename under `Math::Function::Table`; omitted for `Math::Function::Table` itself. */
  readonly name?: string | undefined;
  readonly closeParen?: NodeParameter | undefined;
  readonly openParen?: NodeParameter | undefined;
  readonly options?: NodeOptions | undefined;
  readonly value?: NodeSequence | null | undefined;
}

/**
 * `Math::Function::Table`.
 *
 * Also carries the 10 census classes that alias it; their basename
 * travels in `name`.
 *
 * Bare, its defaults are `Table`'s own — nil parens, `{}` options, nil value.
 * Every aliased subclass overrides `initialize` with a bracket pair, and
 * naming one materializes it: `new TableNode({ name: "Matrix" })` carries
 * `Paren::Lround`/`Paren::Rround` and an empty value list, as
 * `Table::Matrix.new` does. Ruby reaches those nodes by coercion —
 * `Matrix#initialize` defaults the parens to the strings `"("` and `")"`, and
 * `Table#initialize` runs each through `Utility.symbols_class` — so the
 * materialized value is the coerced node, which is what the census measured.
 */
export class TableNode extends NodeBase {
  readonly kind = "table" as const;
  readonly name: string | undefined;
  readonly closeParen: NodeParameter;
  readonly openParen: NodeParameter;
  readonly options: NodeOptions;
  readonly value: NodeSequence | null;

  constructor(init: TableInit = {}) {
    super();
    const alias = aliasDefaults("table", init.name);
    this.name = init.name;
    this.closeParen = assignedParameter(init.closeParen, aliasFallback(alias.closeParen, null));
    this.openParen = assignedParameter(init.openParen, aliasFallback(alias.openParen, null));
    this.options =
      init.options === undefined ? assignedOptions(alias.options) : { ...init.options };
    this.value = assignedSequence(init.value, aliasFallback(alias.value, null));
  }
}

export interface TernaryFunctionInit {
  /** Ruby class basename under `Math::Function` (5 aliased classes share this shape). */
  readonly name: string;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterThree?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::TernaryFunction` — the carrier for its 5 aliased subclasses.
 *
 * Abstract in Ruby, concrete here. Those 5 classes add no field and no
 * equality of their own, so the port represents each as this node plus the
 * Ruby class basename in `name`: `PowerBase` (`x_1^2`) is
 * `new TernaryFunctionNode({ name: "PowerBase", ... })`. No abstract *base* is a union
 * member, which is what ARCHITECTURE.md §5 rules out.
 */
export class TernaryFunctionNode extends NodeBase {
  readonly kind = "ternaryFunction" as const;
  readonly name: string;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter;
  readonly parameterThree: NodeParameter;
  readonly parameterTwo: NodeParameter;

  constructor(init: TernaryFunctionInit) {
    super();
    this.name = init.name;
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = assignedParameter(init.parameterOne);
    this.parameterThree = assignedParameter(init.parameterThree);
    this.parameterTwo = assignedParameter(init.parameterTwo);
  }
}

export interface TextInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly lang?: string | null | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Text`.
 */
export class TextNode extends NodeBase {
  readonly kind = "text" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly lang: string | null;
  readonly parameterOne: NodeParameter;

  constructor(init: TextInit = {}) {
    super();
    this.hideFunctionName = init.hideFunctionName;
    this.lang = assignedValue(init.lang);
    // The one slot whose Ruby default is not nil: `Text#initialize` starts
    // `parameter_one` at the empty string.
    this.parameterOne = assignedParameter(init.parameterOne, "");
  }
}

export interface TildeInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Tilde`.
 */
export class TildeNode extends NodeBase {
  readonly kind = "tilde" as const;
  readonly attributes: NodeOptions;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: TildeInit = {}) {
    super();
    this.attributes = assignedOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

export interface UbraceInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Ubrace`.
 */
export class UbraceNode extends NodeBase {
  readonly kind = "ubrace" as const;
  readonly attributes: NodeOptions;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: UbraceInit = {}) {
    super();
    this.attributes = assignedOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

export interface UlInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Ul`.
 */
export class UlNode extends NodeBase {
  readonly kind = "ul" as const;
  readonly attributes: NodeOptions;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: UlInit = {}) {
    super();
    this.attributes = assignedOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

export interface UnaryFunctionInit {
  /** Ruby class basename under `Math::Function` (48 aliased classes share this shape). */
  readonly name: string;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::UnaryFunction` — the carrier for its 48 aliased subclasses.
 *
 * Abstract in Ruby, concrete here. Those 48 classes add no field and no
 * equality of their own, so the port represents each as this node plus the
 * Ruby class basename in `name`: `Sin` (`sin x`) is
 * `new UnaryFunctionNode({ name: "Sin", ... })`. No abstract *base* is a union
 * member, which is what ARCHITECTURE.md §5 rules out.
 */
export class UnaryFunctionNode extends NodeBase {
  readonly kind = "unaryFunction" as const;
  readonly name: string;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: UnaryFunctionInit) {
    super();
    const alias = aliasDefaults("unaryFunction", init.name);
    this.name = init.name;
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = assignedParameter(
      init.parameterOne,
      aliasFallback(alias.parameterOne, null),
    );
  }
}

export interface UndersetInit {
  readonly hideFunctionName?: boolean | undefined;
  readonly options?: NodeOptions | undefined;
  readonly parameterOne?: NodeParameter | undefined;
  readonly parameterTwo?: NodeParameter | undefined;
}

/**
 * `Math::Function::Underset`.
 */
export class UndersetNode extends NodeBase {
  readonly kind = "underset" as const;
  readonly hideFunctionName: boolean | undefined;
  readonly options: NodeOptions;
  readonly parameterOne: NodeParameter;
  readonly parameterTwo: NodeParameter;

  constructor(init: UndersetInit = {}) {
    super();
    this.hideFunctionName = init.hideFunctionName;
    // `unless options.nil?` here, `unless options.empty?` on `Overset`.
    this.options = assignedOptions(init.options);
    this.parameterOne = assignedParameter(init.parameterOne);
    this.parameterTwo = assignedParameter(init.parameterTwo);
  }
}

export interface VecInit {
  readonly attributes?: NodeOptions | undefined;
  readonly hideFunctionName?: boolean | undefined;
  readonly parameterOne?: NodeParameter | undefined;
}

/**
 * `Math::Function::Vec`.
 */
export class VecNode extends NodeBase {
  readonly kind = "vec" as const;
  readonly attributes: NodeOptions;
  readonly hideFunctionName: boolean | undefined;
  readonly parameterOne: NodeParameter;

  constructor(init: VecInit = {}) {
    super();
    this.attributes = assignedOptions(init.attributes);
    this.hideFunctionName = init.hideFunctionName;
    this.parameterOne = assignedParameter(init.parameterOne);
  }
}

/**
 * The closed discriminated union of every concrete node **class** — real
 * instances, which are the only things that carry `equals()` (§4).
 *
 * Every member is assignable to `MathNode`; the reverse does not hold, which
 * is the whole point of the split. Mirrors Ruby, where `==` likewise lives on
 * the instance and a same-shape Hash does not respond to it.
 */
export type ConstructedMathNode =
  | AbsNode
  | BarNode
  | BaseNode
  | BinaryFunctionNode
  | CeilNode
  | ColorNode
  | DdotNode
  | DotNode
  | FencedNode
  | FloorNode
  | FontStyleNode
  | FormulaNode
  | FracNode
  | HatNode
  | IntNode
  | LinebreakNode
  | MpaddedNode
  | MrowNode
  | NaryNode
  | NormNode
  | NumberNode
  | ObraceNode
  | OintNode
  | OverleftrightarrowNode
  | OversetNode
  | ProdNode
  | SqrtNode
  | SumNode
  | SymbolNode
  | TableNode
  | TernaryFunctionNode
  | TextNode
  | TildeNode
  | UbraceNode
  | UlNode
  | UnaryFunctionNode
  | UndersetNode
  | VecNode;

/**
 * Drops the one member only a real instance has.
 *
 * Written as a distributive conditional on purpose: `Omit<A | B, K>` collapses
 * a union to the keys its members share, which would erase both the `kind`
 * discriminant and every field a single class owns. `T extends unknown ? … : …`
 * maps over the union member by member instead, so the result is still a
 * discriminated union that `switch (node.kind)` narrows and `assertNever`
 * closes.
 */
type NodeData<T> = T extends unknown ? Omit<T, "equals" | typeof NODE_BRAND> : never;

/**
 * The closed discriminated union of every concrete node kind, as **data**
 * (ARCHITECTURE.md §5): a plain object carrying the right fields *is* a
 * `MathNode`, no constructor required. Renderers, `normalize` and the module
 * function `equals(a, b)` all take this type, because §5's dispatch is
 * structural — "any object with a known `kind` and valid shape renders,
 * whatever produced it".
 *
 * Derived from the class union rather than declared beside it, so a field
 * added to a class cannot drift from the data shape, and a kind added to
 * `ConstructedMathNode` is a kind here too.
 */
export type MathNode = NodeData<ConstructedMathNode>;

export type NodeKind = MathNode["kind"];

/** Every kind, in the union's order. Renderers may reject one, never omit it. */
export const NODE_KINDS = [
  "abs",
  "bar",
  "base",
  "binaryFunction",
  "ceil",
  "color",
  "ddot",
  "dot",
  "fenced",
  "floor",
  "fontStyle",
  "formula",
  "frac",
  "hat",
  "int",
  "linebreak",
  "mpadded",
  "mrow",
  "nary",
  "norm",
  "number",
  "obrace",
  "oint",
  "overleftrightarrow",
  "overset",
  "prod",
  "sqrt",
  "sum",
  "symbol",
  "table",
  "ternaryFunction",
  "text",
  "tilde",
  "ubrace",
  "ul",
  "unaryFunction",
  "underset",
  "vec",
] as const satisfies readonly NodeKind[];

const KIND_SET: ReadonlySet<string> = new Set(NODE_KINDS);

/**
 * Whether a value carries a `kind` this model knows.
 *
 * Deliberately NOT a `value is MathNode` type guard. It inspects the
 * discriminant and nothing else, so an object with the right `kind` and no
 * fields would pass — and asserting `MathNode` for that would hand the compiler
 * a guarantee this cannot make. `normalize` would then emit a Ruby model with
 * an empty `fields`, which is not a thing the gem can produce.
 *
 * Callers that need certainty should construct through a node class, which is
 * the only path that establishes shape.
 */
export function hasNodeKind(value: unknown): boolean {
  return kindIsKnown(value);
}

/**
 * The same check, narrowing, for use inside this module and `./normalize`.
 *
 * Sound here in a way it is not at the boundary: these callers compare or
 * serialize a value the model itself produced, so shape is already established.
 * A public guard has no such context, which is why the exported form promises
 * only what it verifies.
 */
function kindIsKnown(value: unknown): value is MathNode {
  return (
    typeof value === "object" &&
    value !== null &&
    KIND_SET.has((value as { readonly kind?: unknown }).kind as string)
  );
}

/* -------------------------------------------------------------------------
 * The equality projection (ARCHITECTURE.md §5, "two distinct projections").
 *
 * `nodeEquals` mirrors Ruby's `==` **per class**, using the field list the
 * census records for that class — not the full field set. `Formula` has five
 * fields and compares two; `Text` ignores `lang`. This is a *looser*
 * equivalence than the normalized-model comparison in `./normalize`, and the
 * two must stay apart: conflating them was a real error in an earlier draft.
 *
 * Two nodes that differ only in a field Ruby's `==` skips compare **equal**.
 *
 * It lives in this file, not in `./equality`, only because §4 promises
 * `node.equals(other)` as a method — see the module docs. `./equality`
 * re-exports it, and that facade is the module-level form §5 prefers for
 * anything a bundler should be able to drop.
 * ---------------------------------------------------------------------- */

/**
 * Per kind, the TypeScript fields that class's Ruby `==` actually compares,
 * taken from `equality.fields` in `corpus/census.yaml`. The suite checks this
 * table against the census, so a drifting entry fails rather than silently
 * loosening equality.
 */
/**
 * Which fields each kind's `==` compares, projected from the gem.
 *
 * Frozen, and every list with it: `readonly` is compile-time only, so without
 * this a consumer could write `EQUALITY_FIELDS.number = []` and make every
 * number equal to every other, everywhere in the process. An exported table
 * that decides core behaviour has to be immutable at runtime too.
 */
export const EQUALITY_FIELDS: { readonly [K in NodeKind]: readonly string[] } = {
  abs: ["parameterOne"],
  bar: ["parameterOne"],
  base: ["options", "parameterOne", "parameterTwo"],
  binaryFunction: ["parameterOne", "parameterTwo"],
  ceil: ["parameterOne"],
  color: ["parameterOne", "parameterTwo"],
  ddot: ["parameterOne"],
  dot: ["parameterOne"],
  fenced: ["options", "parameterOne", "parameterThree", "parameterTwo"],
  floor: ["parameterOne"],
  fontStyle: ["parameterOne", "parameterTwo"],
  formula: ["leftRightWrapper", "value"],
  frac: ["options", "parameterOne", "parameterTwo"],
  hat: ["parameterOne"],
  int: ["options", "parameterOne", "parameterThree", "parameterTwo"],
  linebreak: ["parameterOne"], // `linebreak?` is constant per class
  mpadded: ["options", "parameterOne"],
  mrow: ["leftRightWrapper", "value"],
  nary: ["options", "parameterFour", "parameterOne", "parameterThree", "parameterTwo"],
  norm: ["parameterOne"],
  number: ["base", "miniSubSized", "miniSupSized", "value"],
  obrace: ["parameterOne"],
  oint: ["options", "parameterOne", "parameterThree", "parameterTwo"],
  overleftrightarrow: ["parameterOne"],
  overset: ["parameterOne", "parameterTwo"],
  prod: ["options", "parameterOne", "parameterThree", "parameterTwo"],
  sqrt: ["parameterOne"],
  sum: ["options", "parameterOne", "parameterThree", "parameterTwo"],
  symbol: ["miniSubSized", "miniSupSized", "options", "slashed", "value"],
  table: ["closeParen", "openParen", "options", "value"],
  ternaryFunction: ["parameterOne", "parameterThree", "parameterTwo"],
  text: ["parameterOne"],
  tilde: ["parameterOne"],
  ubrace: ["parameterOne"],
  ul: ["parameterOne"],
  unaryFunction: ["parameterOne"],
  underset: ["parameterOne", "parameterTwo"],
  vec: ["parameterOne"],
};

for (const list of Object.values(EQUALITY_FIELDS)) Object.freeze(list);
Object.freeze(EQUALITY_FIELDS);

/**
 * `Utility::FONT_STYLES` — `FontStyle#==` folds a font-family alias to the
 * class it names before comparing, so `"bf"` and `"mathbf"` are the same
 * family. Kept as pairs rather than an object literal because the keys are
 * Ruby symbols, not identifiers.
 */
const FONT_STYLE_ALIASES: ReadonlyMap<string, string> = new Map([
  ["double-struck", "DoubleStruck"],
  ["sans-serif-bold-italic", "SansSerifBoldItalic"],
  ["sans-serif-italic", "SansSerifItalic"],
  ["bold-sans-serif", "BoldSansSerif"],
  ["sans-serif", "SansSerif"],
  ["bold-fraktur", "BoldFraktur"],
  ["bold-italic", "BoldItalic"],
  ["bold-script", "BoldScript"],
  ["mbfitsans", "SansSerifBoldItalic"],
  ["monospace", "Monospace"],
  ["mathfrak", "Fraktur"],
  ["mitsans", "SansSerifItalic"],
  ["mbfsans", "BoldSansSerif"],
  ["mbffrak", "BoldFraktur"],
  ["mathcal", "Script"],
  ["fraktur", "Fraktur"],
  ["mbfscr", "BoldScript"],
  ["mathbb", "DoubleStruck"],
  ["double", "DoubleStruck"],
  ["mathtt", "Monospace"],
  ["mathsf", "SansSerif"],
  ["mathrm", "Normal"],
  ["textrm", "Normal"],
  ["italic", "Italic"],
  ["mathit", "Italic"],
  ["textit", "Italic"],
  ["mathbf", "Bold"],
  ["textbf", "Bold"],
  ["script", "Script"],
  ["normal", "Normal"],
  ["mbfit", "BoldItalic"],
  ["msans", "SansSerif"],
  ["mfrak", "Fraktur"],
  ["mscr", "Script"],
  ["bold", "Bold"],
  ["bbb", "DoubleStruck"],
  ["Bbb", "DoubleStruck"],
  ["mtt", "Monospace"],
  ["cal", "Script"],
  ["mit", "Italic"],
  ["mup", "Normal"],
  ["mbf", "Bold"],
  ["sf", "SansSerif"],
  ["tt", "Monospace"],
  ["fr", "Fraktur"],
  ["rm", "Normal"],
  ["cc", "Script"],
  ["ii", "Italic"],
  ["bb", "Bold"],
  ["bf", "Bold"],
]);

/**
 * `HTMLEntities::Decoder`'s own regular expression, transcribed.
 *
 * Ruby's is `/&(?:([a-z][a-z0-9]{1,7})|#([0-9]{1,7})|#x([0-9a-f]{1,6}))(;|(?=\n|<))/i`,
 * where `{1,7}` comes from the shortest and longest key in the flavour's table
 * (2 and 8 for `xhtml1`). Three details are load-bearing and all three were
 * measured against the gem rather than read off it:
 *
 * - the terminator is `;` **or** a lookahead at a newline or `<`, so `"&pi<"`
 *   decodes to `"π<"` and `"&pi"` alone does not decode at all;
 * - the name is matched case-insensitively but looked up **verbatim**, so
 *   `&Pi;` decodes and `&PI;` does not;
 * - the digit counts are capped, so `&#00000960;` (8 digits) stays as written.
 *
 * The name length bounds are dropped here, which cannot change an answer: the
 * alnum run after `&` ends at the first character that could be a terminator,
 * so there is exactly one candidate name at each position, and a name outside
 * Ruby's length range is never a key — both implementations therefore leave
 * the same text, and consume the same span, in every case.
 */
const ENTITY_PATTERN =
  /&(?:([a-zA-Z][a-zA-Z0-9]*)|#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6}))(;|(?=\n|<))/g;

/**
 * `String.fromCodePoint`, with the one case where JavaScript is more permissive
 * than Ruby closed.
 *
 * Ruby's `codepoint.chr(Encoding::UTF_8)` raises `RangeError` twice over, and
 * the gem propagates it out of `==` (run at plurimath-oracle `00c52783`):
 *
 * ```text
 * Symbol.new("&#xD800;")   == itself  => RangeError: invalid codepoint 0xD800 in UTF-8
 * Symbol.new("&#1234567;") == itself  => RangeError: 1234567 out of char range
 * ```
 *
 * `String.fromCodePoint` raises `RangeError` for the second — the gem's oracle
 * behaviour, reached natively — but **not** for the first: measured, it returns
 * the lone surrogate `"\ud800"` instead of raising. Ruby has no lone-surrogate
 * string, so parity there needs the explicit throw below. It is still
 * JavaScript's own `RangeError`, not a `PlurimathError`: the package error
 * codes describe package operations, and this is the language's failure.
 *
 * Nothing else in the decoder can be undecodable. The pattern caps a decimal
 * reference at 7 digits and a hex one at 6, so the widest values it can offer
 * are 9,999,999 and 0xFFFFFF — both above U+10FFFF, both raising in the gem
 * too (measured), and a named entity resolves through the gem's own table.
 */
function codepointToString(code: number): string {
  if (code >= 0xd800 && code <= 0xdfff) {
    // Ruby: `RangeError: invalid codepoint 0xD800 in UTF-8`.
    throw new RangeError(`invalid codepoint 0x${code.toString(16).toUpperCase()} in UTF-8`);
  }
  return String.fromCodePoint(code);
}

/**
 * `Plurimath::Utility.html_entity_to_unicode`, which `Symbols::Symbol#==`
 * normalizes both sides through.
 *
 * The gem decodes with `HTMLEntities.new` — the library default flavour,
 * `xhtml1`, whose 253 named entities are generated into
 * `./generated/html-entities`. A JavaScript entity library would be the wrong
 * table: `he` and `entities` implement the larger HTML5 set and decode
 * `&half;` and `&sung;`, which the gem leaves as written.
 */
/**
 * The same decoder under its gem name, exported for the MathML renderer:
 * the gem's XML engine wrapper decodes every attribute WRITE through
 * `Utility.html_entity_to_unicode` (`OxEngine::Element#update_attrs`,
 * element.rb:104-110 — measured: `set_attr("intent" => "&#x2211;")` stores
 * `"∑"`), and `src/xml`'s `setAttribute` deliberately starts at the
 * already-decoded value (its header note), so the renderer decodes before
 * calling it. Exported from THIS internal module, not re-exported from the
 * core barrel (`./index.ts`) — the `describeThrown` precedent: renderer
 * vocabulary, not public API. `src/index.ts` re-exports only the core
 * barrel's named exports, so this stays off the public surface.
 */
export function htmlEntityToUnicode(text: string): string {
  return decodeEntities(text);
}

function decodeEntities(text: string): string {
  // `return string unless string&.include?("&")` — the gem's own fast path.
  if (!text.includes("&")) return text;
  return text.replace(
    ENTITY_PATTERN,
    (match: string, named?: string, decimal?: string, hex?: string): string => {
      if (named !== undefined) {
        const codepoint = XHTML1_ENTITY_CODEPOINTS.get(named);
        return codepoint === undefined ? match : codepointToString(codepoint);
      }
      const digits = decimal ?? hex;
      if (digits === undefined) return match;
      const code = Number.parseInt(digits, decimal === undefined ? 16 : 10);
      // Raises for a codepoint the gem cannot encode, exactly where the gem
      // raises. The equality projection is the gem's, including its failures.
      return codepointToString(code);
    },
  );
}

/**
 * Ruby's `comparable_value`: `normalize_value(symbol.value ||
 * symbol.default_value_for_comparison)`.
 *
 * So a symbol with no value of its own compares by the value its class
 * renders to — `Plus.new == Plus.new("+")` is true in the gem — and both sides
 * are entity-decoded first, which is why `Pi("&pi;")` equals `Pi("π")`.
 *
 * The fallback is read **here**, at comparison time, and never written into
 * the node: `Symbol.new` genuinely stores nil in `@value`, so materializing it
 * in the constructor would make the normalized model disagree with the gem's.
 *
 * An id with no fallback — `Symbol` itself, which Ruby short-circuits with
 * `instance_of?(Symbol)`, the abstract `Paren` root, and any id the gem does
 * not have — compares on `value` alone.
 */
function comparableSymbolValue(node: {
  readonly id?: string | undefined;
  readonly value?: string | null | undefined;
}): string | null {
  // `??`, not `||`: Ruby's `||` falls through on nil alone, and "" is truthy
  // there, so `Plus.new == Plus.new("")` is false. `||` here would read "" as
  // falsy and reach for the fallback.
  const raw = node.value ?? canonicalSymbolValue(node.id);
  return raw === null ? null : decodeEntities(raw);
}

function canonicalSymbolValue(id: string | undefined): string | null {
  if (id === undefined) return null;
  return SYMBOL_CANONICAL_VALUES.get(id) ?? null;
}

function comparableFontFamily(value: NodeParameter | undefined): unknown {
  if (typeof value !== "string") return value;
  const mapped = FONT_STYLE_ALIASES.get(value);
  // Wrapped rather than marked with a sentinel prefix: a folded alias must
  // never collide with a plain family that happens to spell the class name,
  // and `valueEquals` already answers false for an object against a string.
  return mapped === undefined ? value : { fontStyleClass: mapped };
}

/**
 * Ruby's `object.class == self.class`. For the alias carriers that is kind
 * *plus* the carried class name: `Sin` and `Cos` are both `unaryFunction`,
 * and Ruby says they differ.
 */
function sameRubyClass(node: MathNode, other: MathNode): boolean {
  return node.kind === other.kind && identityOf(node) === identityOf(other);
}

function identityOf(node: MathNode): string | undefined {
  const carrier = node as { readonly id?: unknown; readonly name?: unknown };
  if (typeof carrier.id === "string") return carrier.id;
  if (typeof carrier.name === "string") return carrier.name;
  return undefined;
}

/**
 * `undefined` and `null` compare equal here, unlike in `./normalize`. An
 * instance variable Ruby never assigned reads back as `nil` through its
 * accessor, so `==` cannot tell the two apart — but `false` is still not
 * `nil`, exactly as in Ruby.
 */
function valueEquals(left: unknown, right: unknown): boolean {
  const a = left === undefined ? null : left;
  const b = right === undefined ? null : right;
  if (a === null || b === null) return a === b;
  if (kindIsKnown(a) || kindIsKnown(b)) {
    return kindIsKnown(a) && kindIsKnown(b) && nodeEquals(a, b);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const items = b as readonly unknown[];
    return (a as readonly unknown[]).every((item, index) => valueEquals(item, items[index]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    const first = a as Record<string, unknown>;
    const second = b as Record<string, unknown>;
    return keys.every((key) => Object.hasOwn(second, key) && valueEquals(first[key], second[key]));
  }
  return a === b;
}

function fieldsEqual(node: MathNode, other: MathNode, fields: readonly string[]): boolean {
  const a = node as unknown as Record<string, unknown>;
  const b = other as unknown as Record<string, unknown>;
  return fields.every((field) => valueEquals(a[field], b[field]));
}

/** `Symbols::Symbol#==` compares `value` through `comparable_value`, not directly. */
const SYMBOL_PLAIN_FIELDS = EQUALITY_FIELDS.symbol.filter((field) => field !== "value");

/**
 * Structural equality mirroring the gem's `==` for `node`'s class.
 *
 * Dispatch follows Ruby: the *receiver's* class decides which comparison runs.
 * Every rule here is symmetric, so argument order does not change the answer.
 */
export function nodeEquals(node: MathNode, other: unknown): boolean {
  if (!kindIsKnown(other)) return false;
  switch (node.kind) {
    // `Formula#==` checks `respond_to?(:value)` and `respond_to?(:left_right_wrapper)`
    // rather than the class, so a formula and an mrow with the same value are
    // equal — and `Mstyle`, which aliases Formula, compares the same way.
    case "formula":
    case "mrow":
      return (
        (other.kind === "formula" || other.kind === "mrow") &&
        fieldsEqual(node, other, EQUALITY_FIELDS[node.kind])
      );
    // `Number#==` is `is_a?(Number)`; nothing subclasses it.
    case "number":
      return other.kind === "number" && fieldsEqual(node, other, EQUALITY_FIELDS.number);
    case "symbol":
      return (
        other.kind === "symbol" &&
        // `object.class == self.class`: two symbols that share a canonical
        // character — `Lparen` and `Paren::Lround` are both "(" — stay unequal.
        node.id === other.id &&
        comparableSymbolValue(node) === comparableSymbolValue(other) &&
        fieldsEqual(node, other, SYMBOL_PLAIN_FIELDS)
      );
    case "fontStyle":
      return (
        other.kind === "fontStyle" &&
        node.name === other.name &&
        valueEquals(node.parameterOne, other.parameterOne) &&
        valueEquals(
          comparableFontFamily(node.parameterTwo),
          comparableFontFamily(other.parameterTwo),
        )
      );
    default:
      return sameRubyClass(node, other) && fieldsEqual(node, other, EQUALITY_FIELDS[node.kind]);
  }
}
