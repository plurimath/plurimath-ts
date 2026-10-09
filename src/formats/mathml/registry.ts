/**
 * The `core` constructor each node kind finalizes into, for the MathML
 * translator (`./translator.ts`). The generated carriers name a Ruby CLASS;
 * this table says which constructor implements it.
 *
 * A copy of the other formats' tables rather than a shared one: ARCHITECTURE.md
 * §3 rule 3 lets a format import layer 1, leaf services and its own files. The
 * mapped type keeps it total over `NodeKind`, so a new kind without a binding
 * is a compile error.
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

/** A `core` constructor. */
export type MathmlNodeConstructor = new (
  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous init shapes; the kind selects the real one.
  init: any,
) => MathNode;

export const MATHML_NODE_CONSTRUCTORS: { readonly [K in NodeKind]: MathmlNodeConstructor } = {
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
