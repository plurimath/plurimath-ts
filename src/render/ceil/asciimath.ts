/**
 * Mirrors `function/ceil.rb`, which defines no `to_asciimath` of its own:
 * `UnaryFunction#to_asciimath` (`unary_function.rb:21`) renders it, keyword
 * `ceil`.
 */

import type { NodeOf, RenderContext } from "../../formats/asciimath/render-shared";
import { renderUnaryDefault } from "../unary-function/asciimath";

export function renderCeil(node: NodeOf<"ceil">, context: RenderContext): string {
  return renderUnaryDefault("ceil", node.parameterOne, context);
}
