/**
 * Mirrors `function/vec.rb`, which defines no `to_latex` of its own:
 * `UnaryFunction#to_latex` (`unary_function.rb:61`) renders it, command
 * `\vec`.
 */

import type { NodeOf, RenderContext } from "../../formats/latex/render-shared";
import { renderUnaryDefault } from "../unary-function/latex";

export function renderVec(node: NodeOf<"vec">, context: RenderContext): string {
  return renderUnaryDefault("vec", node.parameterOne, context);
}
