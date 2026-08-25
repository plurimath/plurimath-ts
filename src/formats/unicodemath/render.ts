/**
 * The UnicodeMath render table (ARCHITECTURE.md §5, "How this maps to the gem"):
 * one entry per node kind, each entry one per-kind file mirroring the gem
 * file of the class it renders. The table is declared total over `NodeKind`,
 * so a missing entry is a compile error — the explicit spelling of the
 * method table Ruby assembles implicitly when every class defines
 * `to_unicodemath`.
 */

import { type MathNode, type NodeKind, RenderError } from "../../core/index";
import { renderAbs } from "../../render/abs/unicodemath";
import { renderBar } from "../../render/bar/unicodemath";
import { renderBase } from "../../render/base/unicodemath";
import { renderBinaryFunction } from "../../render/binary-function/unicodemath";
import { renderCeil } from "../../render/ceil/unicodemath";
import { renderColor } from "../../render/color/unicodemath";
import { renderDdot } from "../../render/ddot/unicodemath";
import { renderDot } from "../../render/dot/unicodemath";
import { renderFenced } from "../../render/fenced/unicodemath";
import { renderFloor } from "../../render/floor/unicodemath";
import { renderFontStyle } from "../../render/font-style/unicodemath";
import { renderFormula } from "../../render/formula/unicodemath";
import { renderFrac } from "../../render/frac/unicodemath";
import { renderHat } from "../../render/hat/unicodemath";
import { renderInt } from "../../render/int/unicodemath";
import { renderLinebreak } from "../../render/linebreak/unicodemath";
import { renderMpadded } from "../../render/mpadded/unicodemath";
import { renderMrow } from "../../render/mrow/unicodemath";
import { renderNary } from "../../render/nary/unicodemath";
import { renderNorm } from "../../render/norm/unicodemath";
import { renderNumber } from "../../render/number/unicodemath";
import { renderObrace } from "../../render/obrace/unicodemath";
import { renderOint } from "../../render/oint/unicodemath";
import { renderOverleftrightarrow } from "../../render/overleftrightarrow/unicodemath";
import { renderOverset } from "../../render/overset/unicodemath";
import { renderProd } from "../../render/prod/unicodemath";
import { renderSqrt } from "../../render/sqrt/unicodemath";
import { renderSum } from "../../render/sum/unicodemath";
import { renderSymbol } from "../../render/symbol/unicodemath";
import { renderTable } from "../../render/table/unicodemath";
import { renderTernaryFunction } from "../../render/ternary-function/unicodemath";
import { renderText } from "../../render/text/unicodemath";
import { renderTilde } from "../../render/tilde/unicodemath";
import { renderUbrace } from "../../render/ubrace/unicodemath";
import { renderUl } from "../../render/ul/unicodemath";
import { renderUnaryFunction } from "../../render/unary-function/unicodemath";
import { renderUnderset } from "../../render/underset/unicodemath";
import { renderVec } from "../../render/vec/unicodemath";
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
 * Returns `null` exactly where the gem returns nil from `to_unicodemath` — a bare
 * `FontStyle`/`Mpadded` with nothing in it, a base symbol with no value —
 * because callers observe that nil (`Nary` falls back to `"\int"`, a table's
 * open paren falls back to `.`).
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
 * The one context value the unicodemath path ever holds.
 *
 * The gem threads an `options:` hash through every `to_unicodemath`, which
 * looks like a rendering axis and is not one: `Formula#to_unicodemath`
 * (`formula.rb:187`) builds it as `{formatter:, unitsml:, formula:}`, and the
 * only place any of that is read back on this path is
 * `Number#format_value_with_options` (`number.rb:115`), which returns `value`
 * unchanged unless a number formatter is configured. The port has no
 * formatter axis at all, so the hash is inert here and there is nothing to
 * carry. (Distinct from the generated exception matrix, which is separately
 * empty — no symbol's unicodemath value varies on any probed axis; see
 * `test/generated/unicodemath-data.spec.ts`.)
 *
 * What remains is the dispatcher bound to itself, which is how recursion
 * reaches the table without any kind file importing it. The per-node
 * `options` the kind files read is a different thing entirely: a field on the
 * node, set by the parser, not threaded by the renderer.
 */
export const ROOT_CONTEXT: RenderContext = {
  render(node) {
    return renderNode(node, ROOT_CONTEXT);
  },
};
