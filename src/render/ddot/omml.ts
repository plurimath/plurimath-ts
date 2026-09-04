import {
  type NodeOf,
  plainRun,
  present,
  type RenderContext,
  renderLiteralScript,
} from "../../formats/omml/render-shared";
import type { XmlElement } from "../../xml/index";

export function renderDdot(node: NodeOf<"ddot">, context: RenderContext): XmlElement {
  if (!present(node.parameterOne)) return plainRun("..");
  return renderLiteralScript(node.kind, "Upp", node.parameterOne, "..", context, false);
}
