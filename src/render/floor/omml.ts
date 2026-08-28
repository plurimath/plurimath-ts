import {
  type NodeOf,
  type OmmlRendered,
  type RenderContext,
  renderUnaryValue,
  rubyTruthy,
  styledRun,
} from "../../formats/omml/render-shared";

export function renderFloor(node: NodeOf<"floor">, context: RenderContext): OmmlRendered[] {
  return [
    rubyTruthy(node.openParen) ? null : styledRun("⌊"),
    renderUnaryValue(node.parameterOne, context, node.kind, "floor.parameterOne"),
    rubyTruthy(node.closeParen) ? null : styledRun("⌋"),
  ];
}
