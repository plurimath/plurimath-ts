import {
  type NodeOf,
  type OmmlRendered,
  present,
  type RenderContext,
  renderUnaryValue,
  styledRun,
} from "../../formats/omml/render-shared";

export function renderFloor(node: NodeOf<"floor">, context: RenderContext): OmmlRendered[] {
  return [
    present(node.openParen) ? null : styledRun("⌊"),
    renderUnaryValue(node.parameterOne, context, node.kind, "floor.parameterOne"),
    present(node.closeParen) ? null : styledRun("⌋"),
  ];
}
