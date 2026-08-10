/**
 * Mirrors `function/overset.rb`, which defines no `to_latex` of its own:
 * `BinaryFunction#to_latex` (`binary_function.rb:48`) renders it with the
 * class name — `\overset` plus `latex_wrapped` per present field.
 */

import {
  latexWrapped,
  type NodeOf,
  present,
  type RenderContext,
} from "../../formats/latex/render-shared";

export function renderOverset(node: NodeOf<"overset">, context: RenderContext): string {
  return `\\overset${
    present(node.parameterOne)
      ? latexWrapped(node.parameterOne, context, "overset.parameterOne")
      : ""
  }${present(node.parameterTwo) ? latexWrapped(node.parameterTwo, context, "overset.parameterTwo") : ""}`;
}
