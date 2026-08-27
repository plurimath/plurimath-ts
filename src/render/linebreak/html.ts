import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { present, renderChild, s } from "../../formats/html/render-shared";

const BR = "<br/>";

/** `Linebreak#to_html`: only the exact `after` style moves the break behind the child. */
export function renderLinebreak(node: NodeOf<"linebreak">, context: RenderContext): string {
  if (!present(node.parameterOne)) return BR;
  const inner = s(renderChild(node.parameterOne, context, "linebreak.parameterOne"));
  return node.attributes.linebreakstyle === "after" ? `${inner}${BR}` : `${BR}${inner}`;
}
