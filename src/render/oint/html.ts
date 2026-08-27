import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderTernaryDefault } from "../ternary-function/html";

/** `Oint#to_html` is inherited from `TernaryFunction`. */
export function renderOint(node: NodeOf<"oint">, context: RenderContext): string {
  return renderTernaryDefault(
    node.parameterOne,
    node.parameterTwo,
    node.parameterThree,
    context,
    "oint",
  );
}
