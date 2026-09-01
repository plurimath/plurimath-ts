import {
  type NodeOf,
  type OmmlRendered,
  plainRun,
  present,
  type RenderContext,
  renderAccent,
  renderLiteralScript,
  renderUnaryValue,
} from "../../formats/omml/render-shared";

export function renderHat(node: NodeOf<"hat">, context: RenderContext): OmmlRendered {
  if (node.parameterOne === null || node.parameterOne === undefined) return plainRun("^");
  if (present(node.hideFunctionName)) {
    return renderUnaryValue(node.parameterOne, context, node.kind, "hat.parameterOne");
  }
  if (present(node.attributes.accent)) {
    return renderAccent(node.kind, node.parameterOne, "̂", context, "hat.parameterOne");
  }
  return renderLiteralScript(node.kind, "Upp", node.parameterOne, "&#x302;", context, true);
}
