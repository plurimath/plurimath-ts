import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderUnaryDefault } from "../unary-function/html";

/** `Overleftrightarrow#to_html` inherits the unary carrier with measured label `&#x20e1;`. */
export function renderOverleftrightarrow(
  node: NodeOf<"overleftrightarrow">,
  context: RenderContext,
): string {
  return renderUnaryDefault(
    "&#x20e1;",
    node.parameterOne,
    context,
    "overleftrightarrow.parameterOne",
  );
}
