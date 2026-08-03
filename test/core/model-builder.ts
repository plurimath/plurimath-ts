/**
 * Builds a node tree from a corpus `model:` block — the reverse of
 * `normalize`, for the round-trip test only.
 *
 * It is deliberately intolerant: an unknown Ruby class or an unmapped field
 * throws instead of being skipped. That is what stops the round trip from
 * passing vacuously, and it is why a wrong Ruby class name or field name in
 * `NODE_SPECS` fails here rather than cancelling out on both sides.
 *
 * Which implemented class an aliased Ruby class folds into comes from
 * `corpus/census.yaml`, not from `NODE_SPECS`, so the alias mapping has an
 * independent source.
 */

import { readdirSync, readFileSync } from "node:fs";
// Every factory here calls a constructor, so what comes back is an instance
// carrying `equals`, not bare node data. Declaring `MathNode` would widen that
// away and make `.equals` untypeable at the call sites (ARCHITECTURE.md §4).
import type { ConstructedMathNode, NodeKind } from "../../src/core/nodes";
import {
  type AbsInit,
  AbsNode,
  type BarInit,
  BarNode,
  type BaseInit,
  BaseNode,
  type BinaryFunctionInit,
  BinaryFunctionNode,
  type CeilInit,
  CeilNode,
  type ColorInit,
  ColorNode,
  type DdotInit,
  DdotNode,
  type DotInit,
  DotNode,
  type FencedInit,
  FencedNode,
  type FloorInit,
  FloorNode,
  type FontStyleInit,
  FontStyleNode,
  type FormulaInit,
  FormulaNode,
  type FracInit,
  FracNode,
  type HatInit,
  HatNode,
  type IntInit,
  IntNode,
  type LinebreakInit,
  LinebreakNode,
  type MpaddedInit,
  MpaddedNode,
  type MrowInit,
  MrowNode,
  type NaryInit,
  NaryNode,
  NODE_KINDS,
  type NormInit,
  NormNode,
  type NumberInit,
  NumberNode,
  type ObraceInit,
  ObraceNode,
  type OintInit,
  OintNode,
  type OverleftrightarrowInit,
  OverleftrightarrowNode,
  type OversetInit,
  OversetNode,
  type ProdInit,
  ProdNode,
  type SqrtInit,
  SqrtNode,
  type SumInit,
  SumNode,
  type SymbolInit,
  SymbolNode,
  type TableInit,
  TableNode,
  type TernaryFunctionInit,
  TernaryFunctionNode,
  type TextInit,
  TextNode,
  type TildeInit,
  TildeNode,
  type UbraceInit,
  UbraceNode,
  type UlInit,
  UlNode,
  type UnaryFunctionInit,
  UnaryFunctionNode,
  type UndersetInit,
  UndersetNode,
  type VecInit,
  VecNode,
} from "../../src/core/nodes";
import { NODE_SPECS } from "../../src/core/normalize";
import { parseYaml, type YamlValue } from "./corpus-yaml";

type Init = Record<string, unknown>;

const FACTORIES: { readonly [K in NodeKind]: (init: Init) => ConstructedMathNode } = {
  abs: (init) => new AbsNode(init as unknown as AbsInit),
  bar: (init) => new BarNode(init as unknown as BarInit),
  base: (init) => new BaseNode(init as unknown as BaseInit),
  binaryFunction: (init) => new BinaryFunctionNode(init as unknown as BinaryFunctionInit),
  ceil: (init) => new CeilNode(init as unknown as CeilInit),
  color: (init) => new ColorNode(init as unknown as ColorInit),
  ddot: (init) => new DdotNode(init as unknown as DdotInit),
  dot: (init) => new DotNode(init as unknown as DotInit),
  fenced: (init) => new FencedNode(init as unknown as FencedInit),
  floor: (init) => new FloorNode(init as unknown as FloorInit),
  fontStyle: (init) => new FontStyleNode(init as unknown as FontStyleInit),
  formula: (init) => new FormulaNode(init as unknown as FormulaInit),
  frac: (init) => new FracNode(init as unknown as FracInit),
  hat: (init) => new HatNode(init as unknown as HatInit),
  int: (init) => new IntNode(init as unknown as IntInit),
  linebreak: (init) => new LinebreakNode(init as unknown as LinebreakInit),
  mpadded: (init) => new MpaddedNode(init as unknown as MpaddedInit),
  mrow: (init) => new MrowNode(init as unknown as MrowInit),
  nary: (init) => new NaryNode(init as unknown as NaryInit),
  norm: (init) => new NormNode(init as unknown as NormInit),
  number: (init) => new NumberNode(init as unknown as NumberInit),
  obrace: (init) => new ObraceNode(init as unknown as ObraceInit),
  oint: (init) => new OintNode(init as unknown as OintInit),
  overleftrightarrow: (init) =>
    new OverleftrightarrowNode(init as unknown as OverleftrightarrowInit),
  overset: (init) => new OversetNode(init as unknown as OversetInit),
  prod: (init) => new ProdNode(init as unknown as ProdInit),
  sqrt: (init) => new SqrtNode(init as unknown as SqrtInit),
  sum: (init) => new SumNode(init as unknown as SumInit),
  symbol: (init) => new SymbolNode(init as unknown as SymbolInit),
  table: (init) => new TableNode(init as unknown as TableInit),
  ternaryFunction: (init) => new TernaryFunctionNode(init as unknown as TernaryFunctionInit),
  text: (init) => new TextNode(init as unknown as TextInit),
  tilde: (init) => new TildeNode(init as unknown as TildeInit),
  ubrace: (init) => new UbraceNode(init as unknown as UbraceInit),
  ul: (init) => new UlNode(init as unknown as UlInit),
  unaryFunction: (init) => new UnaryFunctionNode(init as unknown as UnaryFunctionInit),
  underset: (init) => new UndersetNode(init as unknown as UndersetInit),
  vec: (init) => new VecNode(init as unknown as VecInit),
};

/**
 * One freshly built node of every kind, for the tests that must cover the
 * whole union rather than a sample of it.
 *
 * `name` is supplied because the three abstract carriers require it; the
 * classes that have no such field ignore it, exactly as they ignore any other
 * key their constructor does not read.
 */
export function oneOfEachKind(): readonly (readonly [NodeKind, ConstructedMathNode])[] {
  return NODE_KINDS.map((kind) => [kind, FACTORIES[kind]({ name: "Sample" })] as const);
}

/**
 * What a class's `initialize` assigns when called with no arguments, measured
 * by the generator instantiating the class (`policy.defaults` in the census).
 *
 * `assigned` is a mapping because a nil value in it is a real assigned nil,
 * which Ruby serializes; `unassigned` lists the declared fields the
 * constructor never touches, which Ruby omits. The two are different states.
 */
export interface CensusDefaults {
  readonly assigned: { readonly [field: string]: YamlValue };
  readonly unassigned: readonly string[];
}

export interface CensusEntry {
  readonly name: string;
  readonly parent: string;
  readonly disposition: "implemented" | "aliased" | "deferred";
  readonly abstract: boolean;
  readonly fields?: readonly string[];
  readonly aliases?: string;
  readonly equality?: { readonly fields: readonly string[] };
  /** Absent on a deferred class, and on an aliased one that adds no override. */
  readonly defaults?: CensusDefaults;
}

export interface Census {
  readonly summary: { readonly [key: string]: number };
  readonly policy: { readonly abstract: readonly string[]; readonly deferred: readonly string[] };
  readonly classes: readonly CensusEntry[];
}

export function readCensus(path = "corpus/census.yaml"): Census {
  return parseYaml(readFileSync(path, "utf8")) as unknown as Census;
}

/** Ruby class name → the implemented class the port represents it with. */
export function aliasIndex(census: Census): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const entry of census.classes) {
    if (entry.disposition === "implemented") index.set(entry.name, entry.name);
    else if (entry.aliases !== undefined) index.set(entry.name, entry.aliases);
  }
  return index;
}

const KIND_BY_RUBY_CLASS: ReadonlyMap<string, NodeKind> = new Map(
  (Object.keys(NODE_SPECS) as NodeKind[]).map((kind) => [NODE_SPECS[kind].rubyClass, kind]),
);

export type SerializedNode = {
  readonly class: string;
  readonly fields: { readonly [key: string]: YamlValue };
};

function isSerializedNode(value: YamlValue): value is SerializedNode {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { class?: unknown }).class === "string" &&
    "fields" in value
  );
}

export function buildNode(
  model: SerializedNode,
  aliases: ReadonlyMap<string, string>,
): ConstructedMathNode {
  const target = aliases.get(model.class);
  if (target === undefined) throw new Error(`census does not know class ${model.class}`);
  const kind = KIND_BY_RUBY_CLASS.get(target);
  if (kind === undefined) throw new Error(`no node kind for ${target} (from ${model.class})`);

  const spec = NODE_SPECS[kind];
  const init: Init = {};
  if (spec.identity !== undefined) {
    const prefix = `${spec.identity.prefix}::`;
    if (model.class.startsWith(prefix))
      init[spec.identity.field] = model.class.slice(prefix.length);
    else if (model.class !== spec.rubyClass)
      throw new Error(`${model.class} is not under ${prefix}`);
  } else if (model.class !== spec.rubyClass) {
    throw new Error(`${model.class} has no identity slot on ${kind}`);
  }

  const fieldNames = new Map(spec.fields);
  for (const [rubyField, value] of Object.entries(model.fields)) {
    const tsField = fieldNames.get(rubyField);
    if (tsField === undefined) throw new Error(`${model.class} has no field ${rubyField}`);
    init[tsField] = buildValue(value, aliases);
  }
  return FACTORIES[kind](init);
}

function buildValue(value: YamlValue, aliases: ReadonlyMap<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => buildValue(item, aliases));
  if (isSerializedNode(value)) return buildNode(value, aliases);
  return value;
}

export interface CorpusCase {
  readonly id: string;
  readonly input: string;
  readonly model: SerializedNode;
}

export function readCorpusCases(directory = "corpus/asciimath"): readonly CorpusCase[] {
  const files = readdirSync(directory)
    .filter((name) => name.endsWith(".yaml") && !name.endsWith(".manifest.yaml"))
    .sort();
  const cases: CorpusCase[] = [];
  for (const file of files) {
    const document = parseYaml(readFileSync(`${directory}/${file}`, "utf8")) as unknown as {
      readonly cases: readonly { id: string; input: string; model: SerializedNode }[];
    };
    for (const entry of document.cases) {
      cases.push({ id: entry.id, input: entry.input, model: entry.model });
    }
  }
  return cases;
}
