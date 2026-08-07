/**
 * Mirrors `function/ddot.rb`, which defines no `to_latex` of its own:
 * `UnaryFunction#to_latex` (`unary_function.rb:61`) renders it, command
 * `\ddot`.
 */

import type { NodeOf, RenderContext } from "./shared";
import { renderUnaryDefault } from "./unary-function";

export function renderDdot(node: NodeOf<"ddot">, context: RenderContext): string {
  return renderUnaryDefault("ddot", node.parameterOne, context);
}
