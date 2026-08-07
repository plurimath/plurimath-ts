/**
 * The LaTeX render table (ARCHITECTURE.md §5, "How this maps to the gem"):
 * one entry per node kind, each entry one per-kind file mirroring the gem
 * file of the class it renders. The table is declared total over `NodeKind`,
 * so a missing entry is a compile error — the explicit spelling of the
 * method table Ruby assembles implicitly when every class defines
 * `to_latex`.
 */

import { type MathNode, type NodeKind, RenderError } from "../../core/index";
import { renderAbs } from "../../render/abs/latex";
import { renderBar } from "../../render/bar/latex";
import { renderBase } from "../../render/base/latex";
import { renderBinaryFunction } from "../../render/binary-function/latex";
import { renderCeil } from "../../render/ceil/latex";
import { renderColor } from "../../render/color/latex";
import { renderDdot } from "../../render/ddot/latex";
import { renderDot } from "../../render/dot/latex";
import { renderFenced } from "../../render/fenced/latex";
import { renderFloor } from "../../render/floor/latex";
import { renderFontStyle } from "../../render/font-style/latex";
import { renderFormula } from "../../render/formula/latex";
import { renderFrac } from "../../render/frac/latex";
import { renderHat } from "../../render/hat/latex";
import { renderInt } from "../../render/int/latex";
import { renderLinebreak } from "../../render/linebreak/latex";
import { renderMpadded } from "../../render/mpadded/latex";
import { renderMrow } from "../../render/mrow/latex";
import { renderNary } from "../../render/nary/latex";
import { renderNorm } from "../../render/norm/latex";
import { renderNumber } from "../../render/number/latex";
import { renderObrace } from "../../render/obrace/latex";
import { renderOint } from "../../render/oint/latex";
import { renderOverleftrightarrow } from "../../render/overleftrightarrow/latex";
import { renderOverset } from "../../render/overset/latex";
import { renderProd } from "../../render/prod/latex";
import { renderSqrt } from "../../render/sqrt/latex";
import { renderSum } from "../../render/sum/latex";
import { renderSymbol } from "../../render/symbol/latex";
import { renderTable } from "../../render/table/latex";
import { renderTernaryFunction } from "../../render/ternary-function/latex";
import { renderText } from "../../render/text/latex";
import { renderTilde } from "../../render/tilde/latex";
import { renderUbrace } from "../../render/ubrace/latex";
import { renderUl } from "../../render/ul/latex";
import { renderUnaryFunction } from "../../render/unary-function/latex";
import { renderUnderset } from "../../render/underset/latex";
import { renderVec } from "../../render/vec/latex";
import { FORMAT, type RenderContext, type RenderFn } from "./render-shared";

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
 * The sole recursive dispatcher (§5), reached through `context.render`.
 * Returns `null` exactly where the gem returns nil from `to_latex` — a bare
 * `FontStyle`/`Mpadded` with nothing in it, a base symbol with no value —
 * because callers observe that nil (`Nary` falls back to `"\int"`, a table's
 * open paren falls back to `.`).
 */
function renderNode(node: MathNode, context: RenderContext): string | null {
  // Correlating the node with its table entry is the one step TypeScript
  // cannot infer over a mapped type; the cast is sound because the table is
  // total and each entry takes exactly its own kind. The runtime guard is
  // §5's other half: compile-time closure does not bind JavaScript callers,
  // and the entry validator's rejection must hold even off the public path.
  const render = RENDERERS[node.kind] as RenderFn<NodeKind> | undefined;
  if (render === undefined) {
    throw new RenderError(`Unknown node kind "${node.kind}"`, FORMAT, node.kind);
  }
  return render(node, context);
}

/**
 * The one context value the latex path ever holds — LaTeX rendering has no
 * option axis (the generated exception matrix is empty; `./render-shared.ts`), so
 * there is nothing to derive. It carries the dispatcher bound to itself,
 * which is how recursion reaches the table without any kind file importing
 * it. Where `Formula#to_latex` starts.
 */
export const ROOT_CONTEXT: RenderContext = {
  render(node) {
    return renderNode(node, ROOT_CONTEXT);
  },
};
