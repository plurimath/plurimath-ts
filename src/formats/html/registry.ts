/**
 * The HTML class registry — `Utility.get_class` and
 * `Utility.symbols_class(..., lang: :html)`, DERIVED from the generated
 * resolution tables in `./generated/transform-tables`.
 *
 * Ruby resolves a captured name at runtime with
 * `Object.const_get("Plurimath::Math::Function::#{capitalize(text)}")`
 * (`lib/plurimath/utility.rb:139`). There is no TypeScript equivalent, so
 * every name `html/transform.rb` can reach is resolved by the generator,
 * through the gem, and this module only BINDS the result: each census carrier
 * resolves through `NODE_SPECS` to its node kind, and one hand-written table
 * maps that kind to its `core` constructor (ARCHITECTURE.md §3 rule 7's
 * explicit map).
 *
 * Two differences from `latex/registry.ts`, both measured rather than assumed.
 *
 * 1. **There is no unresolvable half.** LaTeX carries
 *    `LATEX_TRANSFORM_UNRESOLVED` because four reachable names have no class
 *    and `\Pr_1` raises in the gem. All 30 names reachable from
 *    `html/transform.rb` resolve — the generator stops if one ever does not —
 *    so `getClass` here throws only on a name the grammar cannot produce.
 * 2. **`capitalize`'s `_` split is unreachable.** Every name is a single
 *    lower-case word (`arcsin`, `lim`, `prod`), so the registry is keyed by
 *    the captured text and nothing has to reimplement `capitalize` — the same
 *    arrangement LaTeX uses, for a simpler reason.
 *
 * A **miss is a throw**, in both directions: at import time for an entry this
 * module cannot bind, and at runtime for a `getClass` name the table has no
 * entry for, which is where the gem raises `NameError`.
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
  HTML_TRANSFORM_GET_CLASS,
  HTML_TRANSFORM_SUB_SUP_CLASSES,
  type HtmlTransformClassEntry,
  type HtmlTransformConstructorFamily,
} from "./generated/transform-tables";

/**
 * Which Ruby `initialize` runs when the transform calls `.new` on a resolved
 * class — measured per entry by the generator, never read from source. Four of
 * the six families LaTeX measured appear here; the two that do not
 * (`text`, `binaryAssignedOptions`) belong to names no HTML tag can carry.
 */
export type HtmlConstructorFamily = HtmlTransformConstructorFamily;

/** The `core` constructors a registry entry may name. */
export type HtmlNodeConstructor = new (
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous init shapes; the entry's kind/name select the real one.
  init: any,
) => MathNode;

export interface HtmlClassEntry {
  /** The `core` constructor this name finalizes into. */
  readonly ctor: HtmlNodeConstructor;
  /** The constructor's node kind, for the transform's finalizer. */
  readonly kind: NodeKind;
  /** Ruby class basename for the alias carriers; absent on implemented kinds. */
  readonly name?: string;
  /** The measured `initialize` shape. */
  readonly family: HtmlConstructorFamily;
}

/**
 * The one hand-written table this module keeps: node kind → `core`
 * constructor. Model-structural TypeScript, not gem-derived data — the
 * generated tables name a carrier CLASS, and only this file can say which
 * constructor implements it. The mapped type keeps it total over `NodeKind`,
 * so adding a kind to the model without binding its constructor is a compile
 * error.
 *
 * It is a copy of `latex/registry.ts`'s table rather than a shared one:
 * ARCHITECTURE.md §3 rule 3 lets a format import layer 1, leaf services and
 * its own files, and a second format's registry is none of those. Sharing it
 * would mean promoting it into `core`, which would put a `formats` concern in
 * layer 1.
 */
export const HTML_NODE_CONSTRUCTORS: { readonly [K in NodeKind]: HtmlNodeConstructor } = {
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
 * compilation here, and in `./transform`'s family switch, until the port
 * learns to construct it.
 */
const IMPLEMENTED_FAMILIES: { readonly [F in HtmlConstructorFamily]: true } = {
  unary: true,
  unaryAttributes: true,
  binary: true,
  ternary: true,
};

const IMPLEMENTED_FAMILY_SET: ReadonlySet<string> = new Set(Object.keys(IMPLEMENTED_FAMILIES));

/** Census carrier class → the node kind that implements it, via `NODE_SPECS`. */
const KIND_BY_CARRIER: ReadonlyMap<string, NodeKind> = new Map(
  NODE_KINDS.map((kind) => [NODE_SPECS[kind].rubyClass, kind]),
);

function carrierKind(entry: HtmlTransformClassEntry): NodeKind {
  const kind = KIND_BY_CARRIER.get(entry.carrier);
  if (kind === undefined) {
    throw new Error(
      `html registry: carrier "${entry.carrier}" (for "${entry.name}") is not a declared node kind`,
    );
  }
  return kind;
}

/**
 * The Ruby basename an aliased class rides under on its carrier — the entry's
 * `rubyClass` minus the carrier's identity prefix (`Math::Function::Arccos` on
 * `UnaryFunction` → `Arccos`), exactly what the carrier's identity slot stores.
 */
function aliasIdentity(kind: NodeKind, rubyClass: string): string {
  const identity = NODE_SPECS[kind].identity;
  if (identity === undefined) {
    throw new Error(`html registry: carrier kind "${kind}" has no identity slot`);
  }
  const prefix = `${identity.prefix}::`;
  if (!rubyClass.startsWith(prefix) || rubyClass.length <= prefix.length) {
    throw new Error(
      `html registry: "${rubyClass}" does not sit under the "${kind}" prefix "${prefix}"`,
    );
  }
  return rubyClass.slice(prefix.length);
}

function classEntry(entry: HtmlTransformClassEntry): HtmlClassEntry {
  const kind = carrierKind(entry);
  const ctor = HTML_NODE_CONSTRUCTORS[kind];
  if (!IMPLEMENTED_FAMILY_SET.has(entry.family)) {
    throw new Error(
      `html registry: "${entry.name}" carries the constructor family ` +
        `"${entry.family}", which the transform cannot build`,
    );
  }
  const name = entry.disposition === "aliased" ? aliasIdentity(kind, entry.rubyClass) : undefined;
  return { ctor, kind, family: entry.family, ...(name === undefined ? {} : { name }) };
}

/**
 * Every name `Utility.get_class` can receive from the HTML transform, keyed by
 * the name as CAPTURED.
 */
export const HTML_CLASS_REGISTRY: ReadonlyMap<string, HtmlClassEntry> = new Map(
  HTML_TRANSFORM_GET_CLASS.map((entry) => [entry.name, classEntry(entry)]),
);

/**
 * `Html::Constants::SUB_SUP_CLASSES` as the lookup `transform.rb:49` performs:
 * the captured `sum_prod` text → the class name `get_class` is then given.
 *
 * All eight keys are distinct, so this Map holds all eight pairs — the same
 * count as the list it is built from. It is the VALUES that repeat: `prod`
 * and `sum` each spell three ways (a named entity, a numeric entity, and the
 * raw Unicode symbol), `log` and `lim` once each, four distinct names in
 * total. That value repetition is exactly why the generated table keeps the
 * raw pairs as a list rather than a Map to begin with — `sub_sup_method?`
 * needs the VALUE set (`HTML_SUB_SUP_METHOD_CLASS_NAMES` below), which a
 * lookup keyed the other way cannot hand back.
 */
export const HTML_SUB_SUP_CLASS_OF: ReadonlyMap<string, string> = new Map(
  HTML_TRANSFORM_SUB_SUP_CLASSES,
);

/**
 * `Utility.sub_sup_method?` (`html/utility.rb:10-14`) reduced to its data:
 * the `class_name` values `SUB_SUP_CLASSES.value?` answers true for.
 *
 * Four names — `prod`, `sum`, `log`, `lim` — from eight pairs. The Ruby also
 * guards on `sub_sup.methods.include?(:class_name)`, which is the transform's
 * job rather than this table's: only a node has a `class_name`, and a bare
 * string reaches the `nil` arm.
 */
export const HTML_SUB_SUP_METHOD_CLASS_NAMES: ReadonlySet<string> = new Set(
  HTML_TRANSFORM_SUB_SUP_CLASSES.map(([, className]) => className),
);
