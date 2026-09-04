import {
  type NodeOf,
  type OmmlRendered,
  present,
  type RenderContext,
  renderUnaryValue,
  styledRun,
} from "../../formats/omml/render-shared";

export function renderNorm(node: NodeOf<"norm">, context: RenderContext): OmmlRendered[] {
  return [
    present(node.openParen) ? null : styledRun("∥"),
    renderUnaryValue(node.parameterOne, context, node.kind, "norm.parameterOne"),
    present(node.closeParen) ? null : styledRun("∥"),
  ];
}
