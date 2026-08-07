/**
 * The LaTeX render table (ARCHITECTURE.md §5, "How this maps to the gem"):
 * one entry per node kind, each entry one per-kind file mirroring the gem
 * file of the class it renders. The table is declared total over `NodeKind`,
 * so a missing entry is a compile error — the explicit spelling of the
 * method table Ruby assembles implicitly when every class defines
 * `to_latex`.
 */

import { type MathNode, type NodeKind, RenderError } from "../../../core/index";
import { renderAbs } from "./abs";
import { renderBar } from "./bar";
import { renderBase } from "./base";
import { renderBinaryFunction } from "./binary-function";
import { renderCeil } from "./ceil";
import { renderColor } from "./color";
import { renderDdot } from "./ddot";
import { renderDot } from "./dot";
import { renderFenced } from "./fenced";
import { renderFloor } from "./floor";
import { renderFontStyle } from "./font-style";
import { renderFormula } from "./formula";
import { renderFrac } from "./frac";
import { renderHat } from "./hat";
import { renderInt } from "./int";
import { renderLinebreak } from "./linebreak";
import { renderMpadded } from "./mpadded";
import { renderMrow } from "./mrow";
import { renderNary } from "./nary";
import { renderNorm } from "./norm";
import { renderNumber } from "./number";
import { renderObrace } from "./obrace";
import { renderOint } from "./oint";
import { renderOverleftrightarrow } from "./overleftrightarrow";
import { renderOverset } from "./overset";
import { renderProd } from "./prod";
import { FORMAT, type RenderContext, type RenderFn } from "./shared";
import { renderSqrt } from "./sqrt";
import { renderSum } from "./sum";
import { renderSymbol } from "./symbol";
import { renderTable } from "./table";
import { renderTernaryFunction } from "./ternary-function";
import { renderText } from "./text";
import { renderTilde } from "./tilde";
import { renderUbrace } from "./ubrace";
import { renderUl } from "./ul";
import { renderUnaryFunction } from "./unary-function";
import { renderUnderset } from "./underset";
import { renderVec } from "./vec";

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
 * option axis (the generated exception matrix is empty; `./shared.ts`), so
 * there is nothing to derive. It carries the dispatcher bound to itself,
 * which is how recursion reaches the table without any kind file importing
 * it. Where `Formula#to_latex` starts.
 */
export const ROOT_CONTEXT: RenderContext = {
  render(node) {
    return renderNode(node, ROOT_CONTEXT);
  },
};
