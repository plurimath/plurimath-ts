import {
  type NodeOf,
  plainRun,
  type RenderContext,
  renderAccent,
  renderLiteralScript,
  rubyTruthy,
} from "../../formats/omml/render-shared";
import type { XmlElement } from "../../xml/index";

export function renderTilde(node: NodeOf<"tilde">, context: RenderContext): XmlElement {
  if (node.parameterOne === null || node.parameterOne === undefined) return plainRun("~");
  if (rubyTruthy(node.attributes.accent)) {
    return renderAccent(node.kind, node.parameterOne, "˜", context, "tilde.parameterOne");
  }
  return renderLiteralScript(node.kind, "Upp", node.parameterOne, "~", context, false);
}
