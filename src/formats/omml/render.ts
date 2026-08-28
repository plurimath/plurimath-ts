import { type MathNode, type NodeKind, RenderError } from "../../core/index";
import { renderAbs } from "../../render/abs/omml";
import { renderBar } from "../../render/bar/omml";
import { renderBase } from "../../render/base/omml";
import { renderBinaryFunction } from "../../render/binary-function/omml";
import { renderCeil } from "../../render/ceil/omml";
import { renderDdot } from "../../render/ddot/omml";
import { renderDot } from "../../render/dot/omml";
import { renderFenced } from "../../render/fenced/omml";
import { renderFloor } from "../../render/floor/omml";
import { renderFormula } from "../../render/formula/omml";
import { renderFrac } from "../../render/frac/omml";
import { renderHat } from "../../render/hat/omml";
import { renderInt } from "../../render/int/omml";
import { renderMrow } from "../../render/mrow/omml";
import { renderNary } from "../../render/nary/omml";
import { renderNorm } from "../../render/norm/omml";
import { renderNumber, renderNumberInserted } from "../../render/number/omml";
import { renderObrace } from "../../render/obrace/omml";
import { renderOint } from "../../render/oint/omml";
import { renderOverleftrightarrow } from "../../render/overleftrightarrow/omml";
import { renderOverset } from "../../render/overset/omml";
import { renderProd } from "../../render/prod/omml";
import { renderSum } from "../../render/sum/omml";
import { renderSymbol, renderSymbolInserted } from "../../render/symbol/omml";
import { renderTable } from "../../render/table/omml";
import { renderTernaryFunction } from "../../render/ternary-function/omml";
import { renderText, renderTextInserted } from "../../render/text/omml";
import { renderTilde } from "../../render/tilde/omml";
import { renderUbrace } from "../../render/ubrace/omml";
import { renderUl } from "../../render/ul/omml";
import { renderUnaryFunction } from "../../render/unary-function/omml";
import { renderUnderset } from "../../render/underset/omml";
import { renderVec } from "../../render/vec/omml";
import { FORMAT, type OmmlRendered, type RenderContext, type RenderFn } from "./render-shared";

/** Measured vertical slices. Every omitted kind refuses at this dispatch boundary. */
type SliceKind =
  | "abs"
  | "bar"
  | "base"
  | "binaryFunction"
  | "ceil"
  | "ddot"
  | "dot"
  | "fenced"
  | "floor"
  | "formula"
  | "frac"
  | "hat"
  | "int"
  | "mrow"
  | "nary"
  | "norm"
  | "number"
  | "obrace"
  | "oint"
  | "overleftrightarrow"
  | "overset"
  | "prod"
  | "sum"
  | "symbol"
  | "table"
  | "ternaryFunction"
  | "text"
  | "tilde"
  | "ubrace"
  | "ul"
  | "unaryFunction"
  | "underset"
  | "vec";

const RENDERERS: { readonly [K in SliceKind]: RenderFn<K> } = {
  abs: renderAbs,
  bar: renderBar,
  base: renderBase,
  binaryFunction: renderBinaryFunction,
  ceil: renderCeil,
  ddot: renderDdot,
  dot: renderDot,
  fenced: renderFenced,
  floor: renderFloor,
  formula: renderFormula,
  frac: renderFrac,
  hat: renderHat,
  int: renderInt,
  mrow: renderMrow,
  nary: renderNary,
  norm: renderNorm,
  number: renderNumber,
  obrace: renderObrace,
  oint: renderOint,
  overleftrightarrow: renderOverleftrightarrow,
  overset: renderOverset,
  prod: renderProd,
  sum: renderSum,
  symbol: renderSymbol,
  table: renderTable,
  ternaryFunction: renderTernaryFunction,
  text: renderText,
  tilde: renderTilde,
  ubrace: renderUbrace,
  ul: renderUl,
  unaryFunction: renderUnaryFunction,
  underset: renderUnderset,
  vec: renderVec,
};

function isSliceKind(kind: NodeKind): kind is SliceKind {
  return Object.hasOwn(RENDERERS, kind);
}

function renderNode(node: MathNode, context: RenderContext): OmmlRendered {
  const kind = node.kind;
  if (!isSliceKind(kind)) {
    throw new RenderError(
      `OMML rendering for node kind "${kind}" is outside the measured OMML slices`,
      FORMAT,
      kind,
    );
  }
  const render = RENDERERS[kind] as RenderFn<SliceKind>;
  return render(node as Parameters<typeof render>[0], context);
}

function insertNode(node: MathNode, context: RenderContext): OmmlRendered {
  switch (node.kind) {
    case "number":
      return renderNumberInserted(node, context);
    case "symbol":
      return renderSymbolInserted(node, context);
    case "text":
      return renderTextInserted(node, context);
    default:
      return renderNode(node, context);
  }
}

export function createRenderContext(displaystyle: boolean): RenderContext {
  const context: RenderContext = {
    displaystyle,
    insert(node) {
      return insertNode(node, context);
    },
    render(node) {
      return renderNode(node, context);
    },
    withDisplaystyle(childDisplaystyle) {
      return childDisplaystyle === displaystyle ? context : createRenderContext(childDisplaystyle);
    },
  };
  return context;
}

export const ROOT_CONTEXT = createRenderContext(true);
