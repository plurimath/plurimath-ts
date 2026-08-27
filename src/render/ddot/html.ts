import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { present, renderChild, s } from "../../formats/html/render-shared";

/** `Ddot#to_html`: optional italic child followed by the literal two-dot suffix. */
export function renderDdot(node: NodeOf<"ddot">, context: RenderContext): string {
  const inner = present(node.parameterOne)
    ? `<i>${s(renderChild(node.parameterOne, context, "ddot.parameterOne"))}</i>`
    : "";
  return `${inner}<i>..</i>`;
}
