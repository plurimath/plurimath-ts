import { type MathNode, type NodeKind, RenderError } from "../../core/index";
import { renderBase } from "../../render/base/omml";
import { renderBinaryFunction } from "../../render/binary-function/omml";
import { renderFormula } from "../../render/formula/omml";
import { renderFrac } from "../../render/frac/omml";
import { renderInt } from "../../render/int/omml";
import { renderMrow } from "../../render/mrow/omml";
import { renderNary } from "../../render/nary/omml";
import { renderNumber, renderNumberInserted } from "../../render/number/omml";
import { renderObrace } from "../../render/obrace/omml";
import { renderOint } from "../../render/oint/omml";
import { renderOverset } from "../../render/overset/omml";
import { renderProd } from "../../render/prod/omml";
import { renderSum } from "../../render/sum/omml";
import { renderSymbol, renderSymbolInserted } from "../../render/symbol/omml";
import { renderTable } from "../../render/table/omml";
import { renderTernaryFunction } from "../../render/ternary-function/omml";
import { renderText, renderTextInserted } from "../../render/text/omml";
import { renderUbrace } from "../../render/ubrace/omml";
import { renderUnaryFunction } from "../../render/unary-function/omml";
import { renderUnderset } from "../../render/underset/omml";
import { FORMAT, type OmmlRendered, type RenderContext, type RenderFn } from "./render-shared";

/** Measured vertical slices. Every omitted kind refuses at this dispatch boundary. */
type SliceKind =
  | "base"
  | "binaryFunction"
  | "formula"
  | "frac"
  | "int"
  | "mrow"
  | "nary"
  | "number"
  | "obrace"
  | "oint"
  | "overset"
  | "prod"
  | "sum"
  | "symbol"
  | "table"
  | "ternaryFunction"
  | "text"
  | "ubrace"
  | "unaryFunction"
  | "underset";

const RENDERERS: { readonly [K in SliceKind]: RenderFn<K> } = {
  base: renderBase,
  binaryFunction: renderBinaryFunction,
  formula: renderFormula,
  frac: renderFrac,
  int: renderInt,
  mrow: renderMrow,
  nary: renderNary,
  number: renderNumber,
  obrace: renderObrace,
  oint: renderOint,
  overset: renderOverset,
  prod: renderProd,
  sum: renderSum,
  symbol: renderSymbol,
  table: renderTable,
  ternaryFunction: renderTernaryFunction,
  text: renderText,
  ubrace: renderUbrace,
  unaryFunction: renderUnaryFunction,
  underset: renderUnderset,
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

export const ROOT_CONTEXT: RenderContext = {
  insert(node) {
    return insertNode(node, ROOT_CONTEXT);
  },
  render(node) {
    return renderNode(node, ROOT_CONTEXT);
  },
};
