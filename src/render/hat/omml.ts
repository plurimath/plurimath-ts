import {
  type NodeOf,
  type OmmlRendered,
  plainRun,
  type RenderContext,
  renderAccent,
  renderLiteralScript,
  renderUnaryValue,
  rubyTruthy,
} from "../../formats/omml/render-shared";

export function renderHat(node: NodeOf<"hat">, context: RenderContext): OmmlRendered {
  if (node.parameterOne === null || node.parameterOne === undefined) return plainRun("^");
  if (rubyTruthy(node.hideFunctionName)) {
    return renderUnaryValue(node.parameterOne, context, node.kind, "hat.parameterOne");
  }
  if (rubyTruthy(node.attributes.accent)) {
    return renderAccent(node.kind, node.parameterOne, "̂", context, "hat.parameterOne");
  }
  return renderLiteralScript(node.kind, "Upp", node.parameterOne, "&#x302;", context, true);
}
