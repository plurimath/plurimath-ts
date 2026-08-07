/**
 * Mirrors `function/ddot.rb`, which defines no `to_asciimath` of its own:
 * `UnaryFunction#to_asciimath` (`unary_function.rb:21`) renders it, keyword
 * `ddot`.
 */

import type { NodeOf, RenderContext } from "./shared";
import { renderUnaryDefault } from "./unary-function";

export function renderDdot(node: NodeOf<"ddot">, context: RenderContext): string {
  return renderUnaryDefault("ddot", node.parameterOne, context);
}
