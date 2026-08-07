/**
 * Mirrors `function/sqrt.rb`, which defines no `to_latex` of its own:
 * `UnaryFunction#to_latex` (`unary_function.rb:61`) renders it, command
 * `\sqrt`.
 */

import type { NodeOf, RenderContext } from "./shared";
import { renderUnaryDefault } from "./unary-function";

export function renderSqrt(node: NodeOf<"sqrt">, context: RenderContext): string {
  return renderUnaryDefault("sqrt", node.parameterOne, context);
}
