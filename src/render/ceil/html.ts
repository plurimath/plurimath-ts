import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { present, renderChild, s } from "../../formats/html/render-shared";

/** `Ceil#to_html`: fixed entity fences; the open/close flags are ignored on this path. */
export function renderCeil(node: NodeOf<"ceil">, context: RenderContext): string {
  const inner = present(node.parameterOne)
    ? `<i>${s(renderChild(node.parameterOne, context, "ceil.parameterOne"))}</i>`
    : "";
  return `<i>&#x2308;</i>${inner}<i>&#x2309;</i>`;
}
