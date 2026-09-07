import type { MathNode, NodeKind } from "../../core/index";
import { renderAbs } from "../../render/abs/omml";
import { renderBar } from "../../render/bar/omml";
import { renderBase } from "../../render/base/omml";
import { renderBinaryFunction } from "../../render/binary-function/omml";
import { renderCeil } from "../../render/ceil/omml";
import { renderColor } from "../../render/color/omml";
import { renderDdot } from "../../render/ddot/omml";
import { renderDot } from "../../render/dot/omml";
import { renderFenced } from "../../render/fenced/omml";
import { renderFloor } from "../../render/floor/omml";
import { renderFontStyle } from "../../render/font-style/omml";
import { renderFormula } from "../../render/formula/omml";
import { renderFrac } from "../../render/frac/omml";
import { renderHat } from "../../render/hat/omml";
import { renderInt } from "../../render/int/omml";
import { renderLinebreak } from "../../render/linebreak/omml";
import { renderMpadded } from "../../render/mpadded/omml";
import { renderMrow } from "../../render/mrow/omml";
import { renderNary } from "../../render/nary/omml";
import { renderNorm } from "../../render/norm/omml";
import { renderNumber, renderNumberInserted } from "../../render/number/omml";
import { renderObrace } from "../../render/obrace/omml";
import { renderOint } from "../../render/oint/omml";
import { renderOverleftrightarrow } from "../../render/overleftrightarrow/omml";
import { renderOverset } from "../../render/overset/omml";
import { renderProd } from "../../render/prod/omml";
import { renderSqrt } from "../../render/sqrt/omml";
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
import type { OmmlRendered, RenderContext, RenderFn } from "./render-shared";

/** One measured renderer per `NodeKind`; the mapped type makes omissions compile errors. */
const RENDERERS: { readonly [K in NodeKind]: RenderFn<K> } = {
  abs: renderAbs,
  bar: renderBar,
  base: renderBase,
  binaryFunction: renderBinaryFunction,
  ceil: renderCeil,
  color: renderColor,
  ddot: renderDdot,
  dot: renderDot,
  fenced: renderFenced,
  floor: renderFloor,
  fontStyle: renderFontStyle,
  formula: renderFormula,
  frac: renderFrac,
  hat: renderHat,
  int: renderInt,
  linebreak: renderLinebreak,
  mpadded: renderMpadded,
  mrow: renderMrow,
  nary: renderNary,
  norm: renderNorm,
  number: renderNumber,
  obrace: renderObrace,
  oint: renderOint,
  overleftrightarrow: renderOverleftrightarrow,
  overset: renderOverset,
  prod: renderProd,
  sqrt: renderSqrt,
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

function renderNode(node: MathNode, context: RenderContext): OmmlRendered {
  const render = RENDERERS[node.kind] as RenderFn<NodeKind>;
  return render(node, context);
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
