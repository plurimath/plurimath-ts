/**
 * Mirrors `function/overleftrightarrow.rb`, which defines no `to_asciimath`
 * of its own: `UnaryFunction#to_asciimath` (`unary_function.rb:21`) renders
 * it, keyword `overleftrightarrow`.
 */

import type { NodeOf, RenderContext } from "./shared";
import { renderUnaryDefault } from "./unary-function";

export function renderOverleftrightarrow(
  node: NodeOf<"overleftrightarrow">,
  context: RenderContext,
): string {
  return renderUnaryDefault("overleftrightarrow", node.parameterOne, context);
}
