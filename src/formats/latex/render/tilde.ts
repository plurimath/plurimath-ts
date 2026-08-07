/**
 * Mirrors `function/tilde.rb`, which defines no `to_latex` of its own:
 * `UnaryFunction#to_latex` (`unary_function.rb:61`) renders it, command
 * `\tilde`.
 */

import type { NodeOf, RenderContext } from "./shared";
import { renderUnaryDefault } from "./unary-function";

export function renderTilde(node: NodeOf<"tilde">, context: RenderContext): string {
  return renderUnaryDefault("tilde", node.parameterOne, context);
}
