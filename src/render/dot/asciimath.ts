/**
 * Mirrors `function/dot.rb`, which defines no `to_asciimath` of its own:
 * `UnaryFunction#to_asciimath` (`unary_function.rb:21`) renders it, keyword
 * `dot`.
 */

import type { NodeOf, RenderContext } from "../../formats/asciimath/render-shared";
import { renderUnaryDefault } from "../unary-function/asciimath";

export function renderDot(node: NodeOf<"dot">, context: RenderContext): string {
  return renderUnaryDefault("dot", node.parameterOne, context);
}
