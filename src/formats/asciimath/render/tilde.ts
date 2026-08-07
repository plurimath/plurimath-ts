/**
 * Mirrors `function/tilde.rb`, which defines no `to_asciimath` of its own:
 * `UnaryFunction#to_asciimath` (`unary_function.rb:21`) renders it, keyword
 * `tilde`.
 */

import type { NodeOf, RenderContext } from "./shared";
import { renderUnaryDefault } from "./unary-function";

export function renderTilde(node: NodeOf<"tilde">, context: RenderContext): string {
  return renderUnaryDefault("tilde", node.parameterOne, context);
}
