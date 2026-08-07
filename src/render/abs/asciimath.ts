/**
 * Mirrors `function/abs.rb`, which defines no `to_asciimath` of its own:
 * `UnaryFunction#to_asciimath` (`unary_function.rb:21`) renders it, keyword
 * `abs`.
 */

import type { NodeOf, RenderContext } from "../../formats/asciimath/render-shared";
import { renderUnaryDefault } from "../unary-function/asciimath";

export function renderAbs(node: NodeOf<"abs">, context: RenderContext): string {
  return renderUnaryDefault("abs", node.parameterOne, context);
}
