/**
 * The MathML render table (ARCHITECTURE.md §5, "How this maps to the gem"):
 * one entry per node kind, each entry one per-kind file mirroring the gem
 * file of the class it renders. The table is declared total over
 * `NodeKind`, so a missing entry is a compile error — the explicit spelling
 * of the method table Ruby assembles implicitly when every class defines
 * `to_mathml_without_math_tag`.
 */

import { type MathNode, type NodeKind, RenderError } from "../../core/index";
import { renderAbs } from "../../render/abs/mathml";
import { renderBar } from "../../render/bar/mathml";
import { renderBase } from "../../render/base/mathml";
import { renderBinaryFunction } from "../../render/binary-function/mathml";
import { renderCeil } from "../../render/ceil/mathml";
import { renderColor } from "../../render/color/mathml";
import { renderDdot } from "../../render/ddot/mathml";
import { renderDot } from "../../render/dot/mathml";
import { renderFenced } from "../../render/fenced/mathml";
import { renderFloor } from "../../render/floor/mathml";
import { renderFontStyle } from "../../render/font-style/mathml";
import { renderFormula } from "../../render/formula/mathml";
import { renderFrac } from "../../render/frac/mathml";
import { renderHat } from "../../render/hat/mathml";
import { renderInt } from "../../render/int/mathml";
import { renderLinebreak } from "../../render/linebreak/mathml";
import { renderMpadded } from "../../render/mpadded/mathml";
import { renderMrow } from "../../render/mrow/mathml";
import { renderNary } from "../../render/nary/mathml";
import { renderNorm } from "../../render/norm/mathml";
import { renderNumber } from "../../render/number/mathml";
import { renderObrace } from "../../render/obrace/mathml";
import { renderOint } from "../../render/oint/mathml";
import { renderOverleftrightarrow } from "../../render/overleftrightarrow/mathml";
import { renderOverset } from "../../render/overset/mathml";
import { renderProd } from "../../render/prod/mathml";
import { renderSqrt } from "../../render/sqrt/mathml";
import { renderSum } from "../../render/sum/mathml";
import { renderSymbol } from "../../render/symbol/mathml";
import { renderTable } from "../../render/table/mathml";
import { renderTernaryFunction } from "../../render/ternary-function/mathml";
import { renderText } from "../../render/text/mathml";
import { renderTilde } from "../../render/tilde/mathml";
import { renderUbrace } from "../../render/ubrace/mathml";
import { renderUl } from "../../render/ul/mathml";
import { renderUnaryFunction } from "../../render/unary-function/mathml";
import { renderUnderset } from "../../render/underset/mathml";
import { renderVec } from "../../render/vec/mathml";
import { FORMAT, type MathmlRendered, type RenderContext, type RenderFn } from "./render-shared";

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

/**
 * The sole recursive dispatcher (§5), reached through `context.render`. The
 * one-read `kind` discipline and the own-property guard are the asciimath
 * dispatcher's, for the same reasons (see `../asciimath/render.ts`).
 */
function renderNode(node: MathNode, context: RenderContext): MathmlRendered {
  const kind = node.kind;
  if (!Object.hasOwn(RENDERERS, kind)) {
    throw new RenderError(`Unknown node kind "${kind}"`, FORMAT, kind);
  }
  const render = RENDERERS[kind] as RenderFn<NodeKind>;
  return render(node, context);
}

/**
 * One context per spacing state — `options[:unary_function_spacing]` is
 * fixed for a whole `to_mathml` call and nothing on the walk derives a
 * child context (render-shared.ts). Each carries the dispatcher bound to
 * itself, which is how recursion reaches the table without any kind file
 * importing it.
 */
export const SPACING_CONTEXT: RenderContext = {
  unaryFunctionSpacing: true,
  render(node) {
    return renderNode(node, SPACING_CONTEXT);
  },
};

export const NO_SPACING_CONTEXT: RenderContext = {
  unaryFunctionSpacing: false,
  render(node) {
    return renderNode(node, NO_SPACING_CONTEXT);
  },
};
