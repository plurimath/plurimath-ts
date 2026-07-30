/**
 * `@plurimath/plurimath-ts/core` — the format-blind model layer.
 *
 * Nodes, errors and diagnostics live here; parse and render logic never does.
 * This surface is experimental through the `0.x` line and locks at `1.0`
 * (ARCHITECTURE.md §5).
 */

export type { DeferredFeature, OnUnsupported, UnsupportedDiagnostic } from "./diagnostics";
export { reportUnsupported, resetUnsupportedWarnings } from "./diagnostics";
export { EQUALITY_FIELDS, equals } from "./equality";
export type { PlurimathErrorCode } from "./errors";
export {
  MissingSymbolDataError,
  ParseError,
  PlurimathError,
  RenderError,
  UnsupportedFormatError,
} from "./errors";
/**
 * The node model (§5): a closed, census-complete union of concrete node
 * classes, plus the two projections over it — `equals` (Ruby's `==` per class)
 * and `normalize` (the strict serialization the corpus compares).
 */
export type {
  AbsInit,
  BarInit,
  BaseInit,
  BinaryFunctionInit,
  CeilInit,
  ColorInit,
  DdotInit,
  DotInit,
  FencedInit,
  FloorInit,
  FontStyleInit,
  FormulaInit,
  FracInit,
  HatInit,
  IntInit,
  LinebreakInit,
  MathNode,
  MpaddedInit,
  MrowInit,
  NaryInit,
  NodeKind,
  NodeOptions,
  NodeParameter,
  NodeSequence,
  NormInit,
  NumberInit,
  ObraceInit,
  OintInit,
  OverleftrightarrowInit,
  OversetInit,
  ProdInit,
  SqrtInit,
  SumInit,
  SymbolInit,
  TableInit,
  TernaryFunctionInit,
  TextInit,
  TildeInit,
  UbraceInit,
  UlInit,
  UnaryFunctionInit,
  UndersetInit,
  VecInit,
} from "./nodes";
export {
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
  isMathNode,
  LinebreakNode,
  MpaddedNode,
  MrowNode,
  NaryNode,
  NODE_KINDS,
  NormNode,
  NumberNode,
  ObraceNode,
  OintNode,
  OverleftrightarrowNode,
  OversetNode,
  ProdNode,
  RUBY_ABSTRACT_CLASSES,
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
export type { NodeSpec, NormalizedNode, NormalizedValue } from "./normalize";
export { NODE_SPECS, normalize, rubyClassName } from "./normalize";
