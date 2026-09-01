import { type MathNode, type NodeKind, RenderError } from "../../core/index";
import { renderBase } from "../../render/base/omml";
import { renderBinaryFunction } from "../../render/binary-function/omml";
import { renderFormula } from "../../render/formula/omml";
import { renderFrac } from "../../render/frac/omml";
import { renderMrow } from "../../render/mrow/omml";
import { renderNary } from "../../render/nary/omml";
import { renderNumber, renderNumberInserted } from "../../render/number/omml";
import { renderSymbol, renderSymbolInserted } from "../../render/symbol/omml";
import { renderTable } from "../../render/table/omml";
import { renderTernaryFunction } from "../../render/ternary-function/omml";
import { renderText, renderTextInserted } from "../../render/text/omml";
import { renderUnaryFunction } from "../../render/unary-function/omml";
import { FORMAT, type OmmlRendered, type RenderContext, type RenderFn } from "./render-shared";

/** First measured slice. Every omitted kind refuses at this dispatch boundary. */
type SliceKind =
  | "base"
  | "binaryFunction"
  | "formula"
  | "frac"
  | "mrow"
  | "nary"
  | "number"
  | "symbol"
  | "table"
  | "ternaryFunction"
  | "text"
  | "unaryFunction";

const RENDERERS: { readonly [K in SliceKind]: RenderFn<K> } = {
  base: renderBase,
  binaryFunction: renderBinaryFunction,
  formula: renderFormula,
  frac: renderFrac,
  mrow: renderMrow,
  nary: renderNary,
  number: renderNumber,
  symbol: renderSymbol,
  table: renderTable,
  ternaryFunction: renderTernaryFunction,
  text: renderText,
  unaryFunction: renderUnaryFunction,
};

function isSliceKind(kind: NodeKind): kind is SliceKind {
  return Object.hasOwn(RENDERERS, kind);
}

function renderNode(node: MathNode, context: RenderContext): OmmlRendered {
  const kind = node.kind;
  if (!isSliceKind(kind)) {
    throw new RenderError(
      `OMML rendering for node kind "${kind}" is outside the measured first slice`,
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
