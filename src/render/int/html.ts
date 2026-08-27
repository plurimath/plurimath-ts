import type { NodeOf, RenderContext } from "../../formats/html/render-shared";
import { renderTernaryDefault } from "../ternary-function/html";

/** `Int#to_html` is inherited from `TernaryFunction`. */
export function renderInt(node: NodeOf<"int">, context: RenderContext): string {
  return renderTernaryDefault(
    node.parameterOne,
    node.parameterTwo,
    node.parameterThree,
    context,
    "int",
  );
}
