import {
  type NodeOf,
  plainRun,
  present,
  type RenderContext,
  renderAccent,
  renderLiteralScript,
} from "../../formats/omml/render-shared";
import type { XmlElement } from "../../xml/index";

export function renderDot(node: NodeOf<"dot">, context: RenderContext): XmlElement {
  if (node.parameterOne === null || node.parameterOne === undefined) return plainRun(".");
  if (present(node.attributes.accent)) {
    return renderAccent(node.kind, node.parameterOne, ".", context, "dot.parameterOne");
  }
  return renderLiteralScript(node.kind, "Upp", node.parameterOne, ".", context, false);
}
