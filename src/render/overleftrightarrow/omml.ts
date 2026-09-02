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

export function renderOverleftrightarrow(
  node: NodeOf<"overleftrightarrow">,
  context: RenderContext,
): XmlElement {
  if (!present(node.parameterOne)) return plainRun("&#x20e1;");
  if (
    present(rubyMemberValue(node.attributes, "accent", node.kind, "overleftrightarrow.attributes"))
  ) {
    return renderAccent(
      node.kind,
      node.parameterOne,
      "⃡",
      context,
      "overleftrightarrow.parameterOne",
    );
  }
  return renderLiteralScript(node.kind, "Upp", node.parameterOne, "⃡", context, false);
}
