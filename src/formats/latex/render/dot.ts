/**
 * Mirrors `function/dot.rb`, which defines no `to_latex` of its own:
 * `UnaryFunction#to_latex` (`unary_function.rb:61`) renders it, command
 * `\dot`.
 */

import type { NodeOf, RenderContext } from "./shared";
import { renderUnaryDefault } from "./unary-function";

export function renderDot(node: NodeOf<"dot">, context: RenderContext): string {
  return renderUnaryDefault("dot", node.parameterOne, context);
}
