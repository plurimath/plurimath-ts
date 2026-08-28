import {
  type NodeOf,
  plainRun,
  type RenderContext,
  renderAccent,
  renderLiteralScript,
  rubyTruthy,
} from "../../formats/omml/render-shared";
import type { XmlElement } from "../../xml/index";

export function renderVec(node: NodeOf<"vec">, context: RenderContext): XmlElement {
  if (node.parameterOne === null || node.parameterOne === undefined) return plainRun("&#x2192;");
  if (rubyTruthy(node.attributes.accent)) {
    return renderAccent(node.kind, node.parameterOne, "→", context, "vec.parameterOne");
  }
  return renderLiteralScript(node.kind, "Upp", node.parameterOne, "→", context, false);
}
