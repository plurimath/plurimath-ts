import {
  type NodeOf,
  plainRun,
  present,
  type RenderContext,
  renderAccent,
  renderLiteralScript,
} from "../../formats/omml/render-shared";
import type { XmlElement } from "../../xml/index";

export function renderVec(node: NodeOf<"vec">, context: RenderContext): XmlElement {
  if (node.parameterOne === null || node.parameterOne === undefined) return plainRun("&#x2192;");
  if (present(node.attributes.accent)) {
    return renderAccent(node.kind, node.parameterOne, "→", context, "vec.parameterOne");
  }
  return renderLiteralScript(node.kind, "Upp", node.parameterOne, "→", context, false);
}
