import {
  type NodeOf,
  plainRun,
  present,
  type RenderContext,
  renderAccent,
  renderLiteralScript,
  rubyMemberValue,
} from "../../formats/omml/render-shared";
import type { XmlElement } from "../../xml/index";

export function renderDot(node: NodeOf<"dot">, context: RenderContext): XmlElement {
  if (!present(node.parameterOne)) return plainRun(".");
  if (present(rubyMemberValue(node.attributes, "accent", node.kind, "dot.attributes"))) {
    return renderAccent(node.kind, node.parameterOne, ".", context, "dot.parameterOne");
  }
  return renderLiteralScript(node.kind, "Upp", node.parameterOne, ".", context, false);
}
