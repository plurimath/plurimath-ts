import { type MathNode, type NodeKind, RenderError } from "../../core/index";
import { renderAbs } from "../../render/abs/html";
import { renderBar } from "../../render/bar/html";
import { renderBinaryFunction } from "../../render/binary-function/html";
import { renderColor } from "../../render/color/html";
import { renderDot } from "../../render/dot/html";
import { renderFloor } from "../../render/floor/html";
import { renderFormula } from "../../render/formula/html";
import { renderFrac } from "../../render/frac/html";
import { renderHat } from "../../render/hat/html";
import { renderInt } from "../../render/int/html";
import { renderMpadded } from "../../render/mpadded/html";
import { renderMrow } from "../../render/mrow/html";
import { renderNary } from "../../render/nary/html";
import { renderNorm } from "../../render/norm/html";
import { renderNumber } from "../../render/number/html";
import { renderObrace } from "../../render/obrace/html";
import { renderOint } from "../../render/oint/html";
import { renderOverleftrightarrow } from "../../render/overleftrightarrow/html";
import { renderOverset } from "../../render/overset/html";
import { renderSqrt } from "../../render/sqrt/html";
import { renderSymbol } from "../../render/symbol/html";
import { renderTernaryFunction } from "../../render/ternary-function/html";
import { renderText } from "../../render/text/html";
import { renderTilde } from "../../render/tilde/html";
import { renderUbrace } from "../../render/ubrace/html";
import { renderUl } from "../../render/ul/html";
import { renderUnaryFunction } from "../../render/unary-function/html";
import { renderUnderset } from "../../render/underset/html";
import { renderVec } from "../../render/vec/html";
import { FORMAT, type RenderContext, type RenderFn } from "./render-shared";

/**
 * Measured HTML slice. The nine deferred own-implementing kinds still refuse
 * until their oracle behavior and generated-data needs are implemented.
 */
const RENDERERS = {
  abs: renderAbs,
  bar: renderBar,
  binaryFunction: renderBinaryFunction,
  color: renderColor,
  dot: renderDot,
  floor: renderFloor,
  formula: renderFormula,
  frac: renderFrac,
  hat: renderHat,
  int: renderInt,
  mpadded: renderMpadded,
  mrow: renderMrow,
  nary: renderNary,
  norm: renderNorm,
  number: renderNumber,
  obrace: renderObrace,
  oint: renderOint,
  overleftrightarrow: renderOverleftrightarrow,
  overset: renderOverset,
  sqrt: renderSqrt,
  symbol: renderSymbol,
  ternaryFunction: renderTernaryFunction,
  text: renderText,
  tilde: renderTilde,
  ubrace: renderUbrace,
  ul: renderUl,
  unaryFunction: renderUnaryFunction,
  underset: renderUnderset,
  vec: renderVec,
} satisfies Partial<{ readonly [K in NodeKind]: RenderFn<K> }>;

type SliceKind = keyof typeof RENDERERS;

function isSliceKind(kind: NodeKind): kind is SliceKind {
  return Object.hasOwn(RENDERERS, kind);
}

function renderNode(node: MathNode, context: RenderContext): string | null {
  const kind = node.kind;
  if (!isSliceKind(kind)) {
    throw new RenderError(
      `HTML rendering for node kind "${kind}" is outside the measured HTML slice`,
      FORMAT,
      kind,
    );
  }
  const render = RENDERERS[kind] as RenderFn<SliceKind>;
  return render(node as Parameters<typeof render>[0], context);
}

export const ROOT_CONTEXT: RenderContext = {
  render(node) {
    return renderNode(node, ROOT_CONTEXT);
  },
};
