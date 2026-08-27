import { type MathNode, type NodeKind, RenderError } from "../../core/index";
import { renderAbs } from "../../render/abs/html";
import { renderBinaryFunction } from "../../render/binary-function/html";
import { renderFormula } from "../../render/formula/html";
import { renderFrac } from "../../render/frac/html";
import { renderInt } from "../../render/int/html";
import { renderMrow } from "../../render/mrow/html";
import { renderNary } from "../../render/nary/html";
import { renderNumber } from "../../render/number/html";
import { renderSymbol } from "../../render/symbol/html";
import { renderTernaryFunction } from "../../render/ternary-function/html";
import { renderText } from "../../render/text/html";
import { renderUnaryFunction } from "../../render/unary-function/html";
import { FORMAT, type RenderContext, type RenderFn } from "./render-shared";

/**
 * Phase-one slice. Every omitted kind refuses at runtime; phase two replaces
 * this with the final table typed total over `NodeKind`.
 */
const RENDERERS = {
  abs: renderAbs,
  binaryFunction: renderBinaryFunction,
  formula: renderFormula,
  frac: renderFrac,
  int: renderInt,
  mrow: renderMrow,
  nary: renderNary,
  number: renderNumber,
  symbol: renderSymbol,
  ternaryFunction: renderTernaryFunction,
  text: renderText,
  unaryFunction: renderUnaryFunction,
} satisfies Partial<{ readonly [K in NodeKind]: RenderFn<K> }>;

type SliceKind = keyof typeof RENDERERS;

function isSliceKind(kind: NodeKind): kind is SliceKind {
  return Object.hasOwn(RENDERERS, kind);
}

function renderNode(node: MathNode, context: RenderContext): string | null {
  const kind = node.kind;
  if (!isSliceKind(kind)) {
    throw new RenderError(
      `HTML rendering for node kind "${kind}" is outside the measured phase-one slice`,
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
