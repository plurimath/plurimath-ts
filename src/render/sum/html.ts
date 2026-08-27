import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { present, renderChild, s } from "../../formats/html/render-shared";

/** `Sum#to_html`: the body slot is ignored; only lower and upper limits render. */
export function renderSum(node: NodeOf<"sum">, context: RenderContext): string {
  const sub = present(node.parameterOne)
    ? `<sub>${s(renderChild(node.parameterOne, context, "sum.parameterOne"))}</sub>`
    : "";
  const sup = present(node.parameterTwo)
    ? `<sup>${s(renderChild(node.parameterTwo, context, "sum.parameterTwo"))}</sup>`
    : "";
  return `<i>&sum;</i>${sub}${sup}`;
}
