/**
 * The UnicodeMath class registry — `Utility.get_class` and
 * `Utility::FONT_STYLES`, DERIVED from the generated resolution tables in
 * `./generated/transform-tables`.
 *
 * Ruby resolves a captured name at runtime with
 * `Object.const_get("Plurimath::Math::Function::#{capitalize(text)}")`
 * (`lib/plurimath/utility.rb:139`), and `capitalize` splits on `_`, capitalizes
 * each part and **downcases the tail**. There is no TypeScript equivalent, so
 * the generator resolves every reachable name through the gem and this module
 * only BINDS the result: each census carrier resolves through `NODE_SPECS` to
 * its node kind, and one hand-written table maps that kind to its `core`
 * constructor (ARCHITECTURE.md §3 rule 7's explicit map).
 *
 * A **miss is a throw**, in both directions. At import time an entry this
 * module cannot bind — an unknown carrier, an unimplemented constructor family
 * — stops the module rather than resolving to something plausible. At runtime
 * `getClass` throws on a name the registry has no entry for, which is where the
 * gem raises `NameError`. `UNICODEMATH_TRANSFORM_UNRESOLVED` is empty today
 * (unlike LaTeX's, which carries `Pr`), and this registry carries none of its
 * names either, so the two agree by construction rather than by luck.
 *
 * This is a copy of `latex/registry.ts`'s shape rather than a shared module:
 * ARCHITECTURE.md §3 rule 3 lets a format import layer 1, leaf services and its
 * own files, and a second format's registry is none of those.
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
  UNICODEMATH_TRANSFORM_FONT_STYLES,
  UNICODEMATH_TRANSFORM_GET_CLASS,
  UNICODEMATH_TRANSFORM_NAMED_SYMBOLS,
  type UnicodemathTransformClassEntry,
  type UnicodemathTransformConstructorFamily,
} from "./generated/transform-tables";

/**
 * Which Ruby `initialize` runs when the transform calls `.new` on a resolved
 * class — measured per entry by the generator, never read from source. The
 * vocabulary is `CorpusGenerator`'s, the same measurement the AsciiMath and
 * LaTeX registries carry.
 */
export type UnicodemathConstructorFamily = UnicodemathTransformConstructorFamily;

/** The `core` constructors a registry entry may name. */
export type UnicodemathNodeConstructor = new (
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous init shapes; the entry's kind/name select the real one.
  init: any,
) => MathNode;

export interface UnicodemathClassEntry {
  /** The `core` constructor this name finalizes into. */
  readonly ctor: UnicodemathNodeConstructor;
  /** The constructor's node kind, for the transform's finalizer. */
  readonly kind: NodeKind;
  /** Ruby class basename for the alias carriers; absent on implemented kinds. */
  readonly name?: string;
  /** Absent on the font-style table, which is constructed directly. */
  readonly family?: UnicodemathConstructorFamily;
}

/**
 * The one hand-written table this module keeps: node kind → `core`
 * constructor. Model-structural TypeScript, not gem-derived data — the
 * generated tables name a carrier CLASS, and only this file can say which
 * constructor implements it. The mapped type keeps it total over `NodeKind`,
 * so adding a kind to the model without binding its constructor is a compile
 * error.
 */
export const UNICODEMATH_NODE_CONSTRUCTORS: {
  readonly [K in NodeKind]: UnicodemathNodeConstructor;
} = {
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
 * The families this slice's transform has draft builders for, total over the
 * generated union by construction: a regeneration that measures a NEW family
 * fails compilation here, and in `./transform`'s family switch, until the port
 * learns to construct it.
 */
const IMPLEMENTED_FAMILIES: { readonly [F in UnicodemathConstructorFamily]: true } = {
  unary: true,
  binary: true,
  ternary: true,
};

const IMPLEMENTED_FAMILY_SET: ReadonlySet<string> = new Set(Object.keys(IMPLEMENTED_FAMILIES));

/** Census carrier class → the node kind that implements it, via `NODE_SPECS`. */
const KIND_BY_CARRIER: ReadonlyMap<string, NodeKind> = new Map(
  NODE_KINDS.map((kind) => [NODE_SPECS[kind].rubyClass, kind]),
);

function carrierKind(entry: UnicodemathTransformClassEntry): NodeKind {
  const kind = KIND_BY_CARRIER.get(entry.carrier);
  if (kind === undefined) {
    throw new Error(
      `unicodemath registry: carrier "${entry.carrier}" (for "${entry.name}") is not a ` +
        "declared node kind",
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
    throw new Error(`unicodemath registry: carrier kind "${kind}" has no identity slot`);
  }
  const prefix = `${identity.prefix}::`;
  if (!rubyClass.startsWith(prefix) || rubyClass.length <= prefix.length) {
    throw new Error(
      `unicodemath registry: "${rubyClass}" does not sit under the "${kind}" prefix "${prefix}"`,
    );
  }
  return rubyClass.slice(prefix.length);
}

function classEntry(
  entry: UnicodemathTransformClassEntry,
  requireFamily: boolean,
): UnicodemathClassEntry {
  const kind = carrierKind(entry);
  const ctor = UNICODEMATH_NODE_CONSTRUCTORS[kind];
  const family = entry.family;
  if (requireFamily && (family === undefined || !IMPLEMENTED_FAMILY_SET.has(family))) {
    throw new Error(
      `unicodemath registry: "${entry.name}" ` +
        (family === undefined
          ? "carries no measured constructor family"
          : `carries the constructor family "${family}", which the transform cannot build`),
    );
  }
  const name = entry.disposition === "aliased" ? aliasIdentity(kind, entry.rubyClass) : undefined;
  const built: UnicodemathClassEntry = { ctor, kind, ...(name === undefined ? {} : { name }) };
  return family === undefined ? built : { ...built, family };
}

/**
 * Every name `Utility.get_class` can receive from the UnicodeMath transform and
 * resolve, keyed by the name as CAPTURED — `get_class` capitalizes on the way
 * to a constant, this map does not need to.
 */
export const UNICODEMATH_CLASS_REGISTRY: ReadonlyMap<string, UnicodemathClassEntry> = new Map(
  UNICODEMATH_TRANSFORM_GET_CLASS.map((entry) => [entry.name, classEntry(entry, true)]),
);

/** One `FontStyle` subclass as the transform builds it, from one argument. */
export interface UnicodemathFontStyle {
  /** The subclass basename the carrier's `name` slot stores. */
  readonly name: string;
  /** What a one-argument `.new` leaves in `parameter_two`; nil for six of them. */
  readonly keyword: string | null;
}

/**
 * `Utility::FONT_STYLES` restricted to the texts the `font_class` tag carries:
 * keyword → the `FontStyle` subclass basename plus that subclass's own default
 * `parameter_two`.
 *
 * A **miss is impossible by construction**, unlike LaTeX's: `transform.rb:236`
 * calls `.new` on the lookup with no nil guard, so a text with no entry would
 * raise `NoMethodError`, and generation asserts every reachable text has one.
 * `fontStyleOf` throws rather than falling back, which is where that
 * `NoMethodError` would land.
 */
export const UNICODEMATH_FONT_STYLES: ReadonlyMap<string, UnicodemathFontStyle> = new Map(
  UNICODEMATH_TRANSFORM_FONT_STYLES.map((entry) => {
    const kind = carrierKind(entry);
    if (entry.defaultKeyword === undefined) {
      throw new Error(`unicodemath registry: font style "${entry.name}" carries no defaultKeyword`);
    }
    return [
      entry.name,
      { name: aliasIdentity(kind, entry.rubyClass), keyword: entry.defaultKeyword },
    ] as const;
  }),
);

/**
 * A symbol class the transform names directly, by the generator's role key.
 * Throws on an unknown role: the roles are a closed set written in both files,
 * and a typo must not silently become "no such paren".
 */
export function namedSymbolId(role: string): string {
  const id = UNICODEMATH_TRANSFORM_NAMED_SYMBOLS.get(role);
  if (id === undefined) {
    throw new Error(`unicodemath registry: no generated symbol id for role "${role}"`);
  }
  return id;
}
