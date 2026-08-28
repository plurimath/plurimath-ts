import {
  type NodeOf,
  type OmmlRendered,
  type RenderContext,
  renderUnaryValue,
  rubyTruthy,
  styledRun,
} from "../../formats/omml/render-shared";

export function renderNorm(node: NodeOf<"norm">, context: RenderContext): OmmlRendered[] {
  return [
    rubyTruthy(node.openParen) ? null : styledRun("∥"),
    renderUnaryValue(node.parameterOne, context, node.kind, "norm.parameterOne"),
    rubyTruthy(node.closeParen) ? null : styledRun("∥"),
  ];
}
