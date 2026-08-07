/**
 * Mirrors `function/vec.rb`, which defines no `to_asciimath` of its own:
 * `UnaryFunction#to_asciimath` (`unary_function.rb:21`) renders it, keyword
 * `vec`.
 */

import type { NodeOf, RenderContext } from "../../formats/asciimath/render-shared";
import { renderUnaryDefault } from "../unary-function/asciimath";

export function renderVec(node: NodeOf<"vec">, context: RenderContext): string {
  return renderUnaryDefault("vec", node.parameterOne, context);
}
