import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { present, renderChild, s } from "../../formats/html/render-shared";

/** `Prod#to_html`: the body slot is ignored; only lower and upper limits render. */
export function renderProd(node: NodeOf<"prod">, context: RenderContext): string {
  const sub = present(node.parameterOne)
    ? `<sub>${s(renderChild(node.parameterOne, context, "prod.parameterOne"))}</sub>`
    : "";
  const sup = present(node.parameterTwo)
    ? `<sup>${s(renderChild(node.parameterTwo, context, "prod.parameterTwo"))}</sup>`
    : "";
  return `<i>&prod;</i>${sub}${sup}`;
}
