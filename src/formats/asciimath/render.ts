/**
 * The AsciiMath render table (ARCHITECTURE.md §5, "How this maps to the
 * gem"): one entry per node kind, each entry one per-kind file mirroring the
 * gem file of the class it renders. The table is declared total over
 * `NodeKind`, so a missing entry is a compile error — the explicit spelling
 * of the method table Ruby assembles implicitly when every class defines
 * `to_asciimath`.
 */

import { type MathNode, type NodeKind, RenderError } from "../../core/index";
import { renderAbs } from "../../render/abs/asciimath";
import { renderBar } from "../../render/bar/asciimath";
import { renderBase } from "../../render/base/asciimath";
import { renderBinaryFunction } from "../../render/binary-function/asciimath";
import { renderCeil } from "../../render/ceil/asciimath";
import { renderColor } from "../../render/color/asciimath";
import { renderDdot } from "../../render/ddot/asciimath";
import { renderDot } from "../../render/dot/asciimath";
import { renderFenced } from "../../render/fenced/asciimath";
import { renderFloor } from "../../render/floor/asciimath";
import { renderFontStyle } from "../../render/font-style/asciimath";
import { renderFormula } from "../../render/formula/asciimath";
import { renderFrac } from "../../render/frac/asciimath";
import { renderHat } from "../../render/hat/asciimath";
import { renderInt } from "../../render/int/asciimath";
import { renderLinebreak } from "../../render/linebreak/asciimath";
import { renderMpadded } from "../../render/mpadded/asciimath";
import { renderMrow } from "../../render/mrow/asciimath";
import { renderNary } from "../../render/nary/asciimath";
import { renderNorm } from "../../render/norm/asciimath";
import { renderNumber } from "../../render/number/asciimath";
import { renderObrace } from "../../render/obrace/asciimath";
import { renderOint } from "../../render/oint/asciimath";
import { renderOverleftrightarrow } from "../../render/overleftrightarrow/asciimath";
import { renderOverset } from "../../render/overset/asciimath";
import { renderProd } from "../../render/prod/asciimath";
import { renderSqrt } from "../../render/sqrt/asciimath";
import { renderSum } from "../../render/sum/asciimath";
import { renderSymbol } from "../../render/symbol/asciimath";
import { renderTable } from "../../render/table/asciimath";
import { renderTernaryFunction } from "../../render/ternary-function/asciimath";
import { renderText } from "../../render/text/asciimath";
import { renderTilde } from "../../render/tilde/asciimath";
import { renderUbrace } from "../../render/ubrace/asciimath";
import { renderUl } from "../../render/ul/asciimath";
import { renderUnaryFunction } from "../../render/unary-function/asciimath";
import { renderUnderset } from "../../render/underset/asciimath";
import { renderVec } from "../../render/vec/asciimath";
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
 * Returns `null` exactly where the gem returns nil from `to_asciimath` — a
 * bare `FontStyle` with nothing in it — because callers observe that nil
 * (`Nary` falls back to `"int"` on it).
 */
function renderNode(node: MathNode, context: RenderContext): string | null {
  // `kind` is read exactly ONCE per dispatch: a stateful getter that answered
  // validation with a valid kind can answer a later read with anything, and
  // three reads (index, error message, error kind) could see three values.
  const kind = node.kind;
  // The own-property check is the runtime guard, §5's other half:
  // compile-time closure does not bind JavaScript callers, and the entry
  // validator's rejection must hold even off the public path. `Object.hasOwn`
  // rather than an `undefined` check because the table is a plain object
  // literal: an inherited Object.prototype key is not undefined — "toString"
  // indexes to a real function (which would render as a string, no error) and
  // "__proto__" to Object.prototype itself. The literal stays directly
  // annotated with the mapped type (not laundered through
  // `Object.assign(Object.create(null), ...)`, whose `any`-typed target makes
  // the result `any` and silently disables the missing-entry compile error).
  if (!Object.hasOwn(RENDERERS, kind)) {
    throw new RenderError(`Unknown node kind "${kind}"`, FORMAT, kind);
  }
  // Correlating the node with its table entry is the one step TypeScript
  // cannot infer over a mapped type; the cast is sound because the table is
  // total and each entry takes exactly its own kind.
  const render = RENDERERS[kind] as RenderFn<NodeKind>;
  return render(node, context);
}

/**
 * The two context values the asciimath path ever holds — the axis is one
 * boolean, flipped in exactly one place (`Td`, `../../render/binary-function/asciimath.ts`, via
 * `withTable`). Each carries the dispatcher bound to itself, which is how
 * recursion reaches the table without any kind file importing it.
 */
const TABLE_CONTEXT: RenderContext = {
  table: true,
  render(node) {
    return renderNode(node, TABLE_CONTEXT);
  },
  get withTable(): RenderContext {
    return TABLE_CONTEXT;
  },
};

/** Where `Formula#to_asciimath` starts: no axis set. */
export const ROOT_CONTEXT: RenderContext = {
  table: false,
  render(node) {
    return renderNode(node, ROOT_CONTEXT);
  },
  withTable: TABLE_CONTEXT,
};
