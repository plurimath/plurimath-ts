/**
 * Mirrors `function/sqrt.rb`, which defines no `to_asciimath` of its own:
 * `UnaryFunction#to_asciimath` (`unary_function.rb:21`) renders it, keyword
 * `sqrt`.
 */

import type { NodeOf, RenderContext } from "../../formats/asciimath/render-shared";
import { renderUnaryDefault } from "../unary-function/asciimath";

export function renderSqrt(node: NodeOf<"sqrt">, context: RenderContext): string {
  return renderUnaryDefault("sqrt", node.parameterOne, context);
}
