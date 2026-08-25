/**
 * The AsciiMath class registry — `Utility.get_class`, `Utility::FONT_STYLES`
 * and `Utility::UNARY_CLASSES` (TODO.plan p1/05), DERIVED from the generated
 * reachability census in `src/generated/asciimath/transform-registry.ts`.
 *
 * Ruby resolves a captured name at runtime with
 * `Object.const_get("Plurimath::Math::Function::#{capitalize(text)}")`
 * (`lib/plurimath/utility.rb:139`), which reaches whatever constant exists — including the
 * alias constants `Overbrace = Obrace`, `Underbrace = Ubrace` and
 * `Underline = Ul`. A port cannot const_get, and ARCHITECTURE.md §3 rule 7
 * bans the POC's late-bound mutable registry, so every reachable name gets an
 * explicit entry, built at module scope. Importing this module has no
 * observable effect beyond building the exported tables, which are immutable
 * after that.
 *
 * The names, their resolved classes, their carriers and their constructor
 * families are gem-derived data, so they are never restated here
 * (PORTING-STANDARDS.md, "Generated data discipline"): the census tables are
 * the single source, and this module only BINDS them — each census carrier
 * resolves through `NODE_SPECS` to its node kind, and the one hand-written
 * table maps that kind to its `core` constructor (the map §3 rule 7 asks
 * for). A census entry this module cannot bind — an unknown carrier, or an
 * entry whose measured constructor family the transform has no builder for —
 * throws at import time rather than resolving to something plausible; at
 * runtime a lookup miss throws too (see `getClass` in `./transform`).
 *
 * Entries carry three things the transform needs:
 *   - the `core` constructor the name finalizes into, plus `kind`/`name` — the
 *     carrier identity for aliased classes;
 *   - `family`: which Ruby `initialize` shape the class has, measured by the
 *     generator off the gem's runtime (which ivars get assigned, and whether
 *     a Slice argument is converted) — the draft builders in `./transform`
 *     dispatch on it.
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
  NODE_KINDS,
  type NodeKind,
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
} from "../../core/index";
import { NODE_SPECS } from "../../core/normalize";
import {
  ASCIIMATH_TRANSFORM_FONT_STYLES,
  ASCIIMATH_TRANSFORM_GET_CLASS,
  ASCIIMATH_TRANSFORM_UNARY_CLASSES,
  type AsciimathTransformClassEntry,
  type AsciimathTransformConstructorFamily,
} from "../../generated/asciimath/transform-registry";

/**
 * Which Ruby `initialize` runs when the transform calls `.new` on a resolved
 * class. Measured per census entry by the generator — instantiate, read the
 * ivars back — not assumed from the hierarchy, because Ruby is not uniform
 * here (`Underset` stores an empty options hash where `Overset` skips it;
 * `Bar` assigns `@attributes` where `Abs` assigns nothing but
 * `@parameter_one`). What each measured family corresponds to in the gem:
 *
 * - `unary`: `UnaryFunction#initialize` — assigns `parameter_one` only,
 *   converting a `Slice` argument to its text (`unary_function.rb:10`).
 *   Also `Abs`, `Ceil`, `Floor`, `Norm`, `Sqrt`, which add no initialize of
 *   their own, so their extra declared fields stay unassigned.
 * - `unaryAttributes`: the unary subclasses that add
 *   `@attributes = attributes` with a `{}` default (`function/bar.rb:9-12` and its
 *   eight siblings).
 * - `text`: `Text#initialize` — `parameter_one` defaults to `""` and `@lang`
 *   is always assigned (`text.rb:9`).
 * - `binary`: `BinaryFunction#initialize` — assigns `parameter_one` and
 *   `parameter_two`, no Slice conversion. Also `Frac`, `Overset` (options
 *   stored only when non-empty, and the transform never passes any).
 * - `binaryAssignedOptions`: `Underset#initialize` — `@options = options
 *   unless options.nil?`, so the `{}` default IS stored (`underset.rb:21`).
 * - `ternary`: `TernaryFunction#initialize` — three parameters. Also `Sum`,
 *   `Int`, `Prod`, `Oint` (options stored only when non-empty).
 */
export type AsciimathConstructorFamily = AsciimathTransformConstructorFamily;

/** The `core` constructors a registry entry may name. */
export type AsciimathNodeConstructor = new (
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous init shapes; the entry's kind/name select the real one.
  init: any,
) => MathNode;

export interface AsciimathClassEntry {
  /** The `core` constructor this name finalizes into. */
  readonly ctor: AsciimathNodeConstructor;
  /** The constructor's node kind, for the transform's finalizer. */
  readonly kind: NodeKind;
  /** Ruby class basename for the alias carriers; absent on implemented kinds. */
  readonly name?: string;
  readonly family: AsciimathConstructorFamily;
}

/**
 * The one hand-written table this module keeps: node kind → `core`
 * constructor. It is model-structural TypeScript, not gem-derived data — the
 * census names a carrier CLASS, but only this file can say which constructor
 * implements it. The mapped type keeps it total over `NodeKind`: adding a
 * kind to the model without binding its constructor is a compile error, and
 * binding a kind twice or misspelling one is too.
 */
export const ASCIIMATH_NODE_CONSTRUCTORS: { readonly [K in NodeKind]: AsciimathNodeConstructor } = {
  abs: AbsNode,
  bar: BarNode,
  base: BaseNode,
  binaryFunction: BinaryFunctionNode,
  ceil: CeilNode,
  color: ColorNode,
  ddot: DdotNode,
  dot: DotNode,
  fenced: FencedNode,
  floor: FloorNode,
  fontStyle: FontStyleNode,
  formula: FormulaNode,
  frac: FracNode,
  hat: HatNode,
  int: IntNode,
  linebreak: LinebreakNode,
  mpadded: MpaddedNode,
  mrow: MrowNode,
  nary: NaryNode,
  norm: NormNode,
  number: NumberNode,
  obrace: ObraceNode,
  oint: OintNode,
  overleftrightarrow: OverleftrightarrowNode,
  overset: OversetNode,
  prod: ProdNode,
  sqrt: SqrtNode,
  sum: SumNode,
  symbol: SymbolNode,
  table: TableNode,
  ternaryFunction: TernaryFunctionNode,
  text: TextNode,
  tilde: TildeNode,
  ubrace: UbraceNode,
  ul: UlNode,
  unaryFunction: UnaryFunctionNode,
  underset: UndersetNode,
  vec: VecNode,
};

/**
 * The families the transform has draft builders for, total over the generated
 * union by construction: a regeneration that measures a NEW family fails
 * compilation here (and in `./transform`'s dispatch) until the port learns to
 * construct it. The runtime Set backs `classEntry`'s import-time guard — the
 * generated table is data, and `./transform`'s family switch has no default
 * arm, so an unlisted value must stop here rather than construct nothing.
 */
const IMPLEMENTED_FAMILIES: { readonly [F in AsciimathConstructorFamily]: true } = {
  unary: true,
  unaryAttributes: true,
  text: true,
  binary: true,
  binaryAssignedOptions: true,
  ternary: true,
};

const IMPLEMENTED_FAMILY_SET: ReadonlySet<string> = new Set(Object.keys(IMPLEMENTED_FAMILIES));

/** Census carrier class → the node kind that implements it, via `NODE_SPECS`. */
const KIND_BY_CARRIER: ReadonlyMap<string, NodeKind> = new Map(
  NODE_KINDS.map((kind) => [NODE_SPECS[kind].rubyClass, kind]),
);

function carrierKind(census: AsciimathTransformClassEntry): NodeKind {
  const kind = KIND_BY_CARRIER.get(census.carrier);
  if (kind === undefined) {
    throw new Error(
      `asciimath registry: census carrier "${census.carrier}" (for "${census.name}") ` +
        "is not a declared node kind",
    );
  }
  return kind;
}

/**
 * The Ruby basename an aliased class rides under on its carrier — the census
 * `rubyClass` minus the carrier's identity prefix (`Math::Function::Arccos`
 * on `UnaryFunction` → `Arccos`), exactly what the carrier's identity slot
 * stores and `rubyClassName` reconstructs.
 */
function aliasIdentity(kind: NodeKind, rubyClass: string): string {
  const identity = NODE_SPECS[kind].identity;
  if (identity === undefined) {
    throw new Error(`asciimath registry: carrier kind "${kind}" has no identity slot`);
  }
  const prefix = `${identity.prefix}::`;
  if (!rubyClass.startsWith(prefix) || rubyClass.length <= prefix.length) {
    throw new Error(
      `asciimath registry: "${rubyClass}" does not sit under the "${kind}" prefix "${prefix}"`,
    );
  }
  return rubyClass.slice(prefix.length);
}

function classEntry(census: AsciimathTransformClassEntry): AsciimathClassEntry {
  const kind = carrierKind(census);
  const family = census.family;
  if (family === undefined || !IMPLEMENTED_FAMILY_SET.has(family)) {
    throw new Error(
      `asciimath registry: census entry "${census.name}" ` +
        (family === undefined
          ? "carries no measured constructor family"
          : `carries the constructor family "${family}", which the transform cannot build`),
    );
  }
  const ctor = ASCIIMATH_NODE_CONSTRUCTORS[kind];
  if (census.disposition === "aliased") {
    return { ctor, kind, name: aliasIdentity(kind, census.rubyClass), family };
  }
  return { ctor, kind, family };
}

/**
 * Every name `Utility.get_class` can receive from the AsciiMath transform, in
 * the census's (sorted) order. Keys are the names as captured — `get_class`
 * capitalizes on the way to a constant, this map does not need to.
 */
export const ASCIIMATH_CLASS_REGISTRY: ReadonlyMap<string, AsciimathClassEntry> = new Map(
  ASCIIMATH_TRANSFORM_GET_CLASS.map((census) => [census.name, classEntry(census)]),
);

/**
 * `Utility::FONT_STYLES` (`lib/plurimath/utility.rb:7-58`): font keyword → the `FontStyle`
 * subclass basename it resolves to, from the census's resolved classes. The
 * transform indexes this with the captured `fonts_class` text and constructs
 * `FontStyleNode({ name, ... })`; the constructor itself is one class for all
 * fifty keywords, which is why the value is a basename rather than a second
 * constructor map. (Iteration order is the census's sorted order, not
 * `lib/plurimath/utility.rb`'s; the table is only ever indexed.)
 */
export const ASCIIMATH_FONT_STYLES: ReadonlyMap<string, string> = new Map(
  ASCIIMATH_TRANSFORM_FONT_STYLES.map((census) => [
    census.name,
    aliasIdentity(carrierKind(census), census.rubyClass),
  ]),
);

/** The constructor every font-style keyword resolves through. */
export const ASCIIMATH_FONT_STYLE_CONSTRUCTOR: AsciimathNodeConstructor =
  ASCIIMATH_NODE_CONSTRUCTORS.fontStyle;

/**
 * `Utility::UNARY_CLASSES` (`lib/plurimath/utility.rb:64-98`), in the gem's order — the
 * generated list itself. The transform asks membership only — whether a unary
 * argument keeps its fence — so a Set serves it.
 */
export const ASCIIMATH_UNARY_CLASS_NAMES: readonly string[] = ASCIIMATH_TRANSFORM_UNARY_CLASSES;

export const ASCIIMATH_UNARY_CLASS_SET: ReadonlySet<string> = new Set(ASCIIMATH_UNARY_CLASS_NAMES);
