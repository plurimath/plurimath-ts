import { type MathNode, type NodeKind, RenderError } from "../../core/index";
import { renderAbs } from "../../render/abs/html";
import { renderBar } from "../../render/bar/html";
import { renderBase } from "../../render/base/html";
import { renderBinaryFunction } from "../../render/binary-function/html";
import { renderCeil } from "../../render/ceil/html";
import { renderColor } from "../../render/color/html";
import { renderDdot } from "../../render/ddot/html";
import { renderDot } from "../../render/dot/html";
import { renderFenced } from "../../render/fenced/html";
import { renderFloor } from "../../render/floor/html";
import { renderFontStyle } from "../../render/font-style/html";
import { renderFormula } from "../../render/formula/html";
import { renderFrac } from "../../render/frac/html";
import { renderHat } from "../../render/hat/html";
import { renderInt } from "../../render/int/html";
import { renderLinebreak } from "../../render/linebreak/html";
import { renderMpadded } from "../../render/mpadded/html";
import { renderMrow } from "../../render/mrow/html";
import { renderNary } from "../../render/nary/html";
import { renderNorm } from "../../render/norm/html";
import { renderNumber } from "../../render/number/html";
import { renderObrace } from "../../render/obrace/html";
import { renderOint } from "../../render/oint/html";
import { renderOverleftrightarrow } from "../../render/overleftrightarrow/html";
import { renderOverset } from "../../render/overset/html";
import { renderProd } from "../../render/prod/html";
import { renderSqrt } from "../../render/sqrt/html";
import { renderSum } from "../../render/sum/html";
import { renderSymbol } from "../../render/symbol/html";
import { renderTable } from "../../render/table/html";
import { renderTernaryFunction } from "../../render/ternary-function/html";
import { renderText } from "../../render/text/html";
import { renderTilde } from "../../render/tilde/html";
import { renderUbrace } from "../../render/ubrace/html";
import { renderUl } from "../../render/ul/html";
import { renderUnaryFunction } from "../../render/unary-function/html";
import { renderUnderset } from "../../render/underset/html";
import { renderVec } from "../../render/vec/html";
import { FORMAT, type RenderContext, type RenderFn } from "./render-shared";

/** One measured renderer per `NodeKind`; `nary` is the gem-matching refusal entry. */
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

function renderNode(node: MathNode, context: RenderContext): string | null {
  const kind = node.kind;
  if (!Object.hasOwn(RENDERERS, kind)) {
    throw new RenderError(`Unknown node kind "${kind}"`, FORMAT, kind);
  }
  const render = RENDERERS[kind] as RenderFn<NodeKind>;
  return render(node, context);
}

export const ROOT_CONTEXT: RenderContext = {
  render(node) {
    return renderNode(node, ROOT_CONTEXT);
  },
};
