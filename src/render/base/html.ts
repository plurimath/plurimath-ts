import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { present, renderChild, s } from "../../formats/html/render-shared";

/** `Base#to_html`: italic base followed by a subscript, each independently optional. */
export function renderBase(node: NodeOf<"base">, context: RenderContext): string {
  const first = present(node.parameterOne)
    ? `<i>${s(renderChild(node.parameterOne, context, "base.parameterOne"))}</i>`
    : "";
  const second = present(node.parameterTwo)
    ? `<sub>${s(renderChild(node.parameterTwo, context, "base.parameterTwo"))}</sub>`
    : "";
  return `${first}${second}`;
}
