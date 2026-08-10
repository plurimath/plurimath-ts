/**
 * Mirrors `function/abs.rb`, which defines no `to_latex` of its own:
 * `UnaryFunction#to_latex` (`unary_function.rb:61`) renders it, command
 * `\abs`.
 */

import type { NodeOf, RenderContext } from "../../formats/latex/render-shared";
import { renderUnaryDefault } from "../unary-function/latex";

export function renderAbs(node: NodeOf<"abs">, context: RenderContext): string {
  return renderUnaryDefault("abs", node.parameterOne, context);
}
