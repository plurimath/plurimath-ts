/**
 * Mirrors `function/floor.rb`, which defines no `to_asciimath` of its own:
 * `UnaryFunction#to_asciimath` (`unary_function.rb:21`) renders it, keyword
 * `floor`.
 */

import type { NodeOf, RenderContext } from "../../formats/asciimath/render-shared";
import { renderUnaryDefault } from "../unary-function/asciimath";

export function renderFloor(node: NodeOf<"floor">, context: RenderContext): string {
  return renderUnaryDefault("floor", node.parameterOne, context);
}
