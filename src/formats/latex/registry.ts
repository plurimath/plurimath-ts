/**
 * The LaTeX class registry — `Utility.get_class`, `Utility.get_table_class`
 * and `Utility::FONT_STYLES`, DERIVED from the generated resolution tables in
 * `./generated/transform-tables`.
 *
 * Ruby resolves a captured name at runtime with
 * `Object.const_get("Plurimath::Math::Function::#{capitalize(text)}")`
 * (`lib/plurimath/utility.rb:139`). Two things make that unportable rather than
 * merely inconvenient. `capitalize` splits on `_`, capitalizes each part and
 * **downcases the tail**, so `vmatrix` and `Vmatrix` both land on
 * `Table::Vmatrix` and a naive `s[0].toUpperCase() + s.slice(1)` would look for
 * `Table::VMatrix`. And const_get reaches alias constants — `Overbrace =
 * Obrace`, `Underbrace = Ubrace` — so the name captured is not the class's own
 * name. Both are resolved by the generator, through the gem, and this module
 * only BINDS the result: each census carrier resolves through `NODE_SPECS` to
 * its node kind, and one hand-written table maps that kind to its `core`
 * constructor (ARCHITECTURE.md §3 rule 7's explicit map, not the POC's
 * late-bound mutable registry).
 *
 * A **miss is a throw**, in both directions. At import time an entry this
 * module cannot bind — an unknown carrier, an unimplemented constructor family
 * — stops the module rather than resolving to something plausible. At runtime
 * `getClass` throws on a name the registry has no entry for, which is where the
 * gem raises `NameError`: `LATEX_TRANSFORM_UNRESOLVED` lists the four names the
 * gem itself cannot resolve (`Pr`, `binom`, `bmod`, `pmod`), and this registry
 * deliberately carries none of them, so `\Pr_1` fails here exactly as it fails
 * there.
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
  LATEX_TRANSFORM_FONT_STYLES,
  LATEX_TRANSFORM_GET_CLASS,
  LATEX_TRANSFORM_TABLE_CLASS,
  type LatexTransformClassEntry,
  type LatexTransformConstructorFamily,
} from "./generated/transform-tables";

/**
 * Which Ruby `initialize` runs when the transform calls `.new` on a resolved
 * class — measured per entry by the generator, never read from source. What
 * each family means here is what it means in `asciimath/registry.ts`; the two
 * vocabularies are the same because they are the same measurement, made by the
 * same `CorpusGenerator` code against the same classes.
 */
export type LatexConstructorFamily = LatexTransformConstructorFamily;

/** The `core` constructors a registry entry may name. */
export type LatexNodeConstructor = new (
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous init shapes; the entry's kind/name select the real one.
  init: any,
) => MathNode;

export interface LatexClassEntry {
  /** The `core` constructor this name finalizes into. */
  readonly ctor: LatexNodeConstructor;
  /** The constructor's node kind, for the transform's finalizer. */
  readonly kind: NodeKind;
  /** Ruby class basename for the alias carriers; absent on implemented kinds. */
  readonly name?: string;
  /** Absent on the table and font-style tables, which are constructed directly. */
  readonly family?: LatexConstructorFamily;
}

/**
 * The one hand-written table this module keeps: node kind → `core`
 * constructor. Model-structural TypeScript, not gem-derived data — the
 * generated tables name a carrier CLASS, and only this file can say which
 * constructor implements it. The mapped type keeps it total over `NodeKind`,
 * so adding a kind to the model without binding its constructor is a compile
 * error.
 *
 * It is a copy of `asciimath/registry.ts`'s table rather than a shared one:
 * ARCHITECTURE.md §3 rule 3 lets a format import layer 1, leaf services and
 * its own files, and a second format's registry is none of those. Sharing it
 * would mean promoting it into `core`, which would put a `formats` concern in
 * layer 1.
 */
export const LATEX_NODE_CONSTRUCTORS: { readonly [K in NodeKind]: LatexNodeConstructor } = {
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
const IMPLEMENTED_FAMILIES: { readonly [F in LatexConstructorFamily]: true } = {
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

function carrierKind(entry: LatexTransformClassEntry): NodeKind {
  const kind = KIND_BY_CARRIER.get(entry.carrier);
  if (kind === undefined) {
    throw new Error(
      `latex registry: carrier "${entry.carrier}" (for "${entry.name}") is not a declared node kind`,
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
    throw new Error(`latex registry: carrier kind "${kind}" has no identity slot`);
  }
  const prefix = `${identity.prefix}::`;
  if (!rubyClass.startsWith(prefix) || rubyClass.length <= prefix.length) {
    throw new Error(
      `latex registry: "${rubyClass}" does not sit under the "${kind}" prefix "${prefix}"`,
    );
  }
  return rubyClass.slice(prefix.length);
}

function classEntry(entry: LatexTransformClassEntry, requireFamily: boolean): LatexClassEntry {
  const kind = carrierKind(entry);
  const ctor = LATEX_NODE_CONSTRUCTORS[kind];
  const family = entry.family;
  if (requireFamily && (family === undefined || !IMPLEMENTED_FAMILY_SET.has(family))) {
    throw new Error(
      `latex registry: "${entry.name}" ` +
        (family === undefined
          ? "carries no measured constructor family"
          : `carries the constructor family "${family}", which the transform cannot build`),
    );
  }
  const name = entry.disposition === "aliased" ? aliasIdentity(kind, entry.rubyClass) : undefined;
  const built: LatexClassEntry = { ctor, kind, ...(name === undefined ? {} : { name }) };
  return family === undefined ? built : { ...built, family };
}

function indexBy(
  entries: readonly LatexTransformClassEntry[],
  requireFamily: boolean,
): ReadonlyMap<string, LatexClassEntry> {
  return new Map(entries.map((entry) => [entry.name, classEntry(entry, requireFamily)]));
}

/**
 * Every name `Utility.get_class` can receive from the LaTeX transform and
 * resolve, keyed by the name as CAPTURED — `get_class` capitalizes on the way
 * to a constant, this map does not need to.
 */
export const LATEX_CLASS_REGISTRY: ReadonlyMap<string, LatexClassEntry> = indexBy(
  LATEX_TRANSFORM_GET_CLASS,
  true,
);

/**
 * `Utility.get_table_class` over the ten `MATRICES` keys. `vmatrix` and
 * `Vmatrix` both map here to `Table::Vmatrix`, and `bmatrix`/`Bmatrix` to
 * `Table::Bmatrix`, because `capitalize` downcases the tail — the generator
 * asserts that fold rather than this file assuming it.
 */
export const LATEX_TABLE_CLASS_REGISTRY: ReadonlyMap<string, LatexClassEntry> = indexBy(
  LATEX_TRANSFORM_TABLE_CLASS,
  false,
);

/**
 * `Utility::FONT_STYLES` (`lib/plurimath/utility.rb:7-58`): font keyword → the
 * `FontStyle` subclass basename it resolves to. The transform indexes this
 * with the captured `fonts` text and builds `FontStyleNode({ name, ... })`;
 * one constructor serves all fifty keywords, which is why the value is a
 * basename rather than a second constructor map.
 *
 * A **miss is not an error here** — unlike `getClass`. The four font rules
 * (`transform.rb:417`, `:592`, `:612`, `:633`) fall back to the generic
 * `Math::Function::FontStyle`, and seven texts the grammar can produce take
 * that branch (`LATEX_FONT_STYLE_FALLBACK_TEXTS`).
 */
export const LATEX_FONT_STYLES: ReadonlyMap<string, string> = new Map(
  LATEX_TRANSFORM_FONT_STYLES.map((entry) => [
    entry.name,
    aliasIdentity(carrierKind(entry), entry.rubyClass),
  ]),
);
