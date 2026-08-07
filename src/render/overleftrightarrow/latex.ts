/**
 * Mirrors `function/overleftrightarrow.rb`, which defines no `to_latex` of
 * its own: `UnaryFunction#to_latex` (`unary_function.rb:61`) renders it,
 * command `\overleftrightarrow`.
 */

import type { NodeOf, RenderContext } from "../../formats/latex/render-shared";
import { renderUnaryDefault } from "../unary-function/latex";

export function renderOverleftrightarrow(
  node: NodeOf<"overleftrightarrow">,
  context: RenderContext,
): string {
  return renderUnaryDefault("overleftrightarrow", node.parameterOne, context);
}
