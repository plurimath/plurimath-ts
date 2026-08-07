/**
 * Mirrors `function/underset.rb`, which defines no `to_latex` of its own:
 * `BinaryFunction#to_latex` (`binary_function.rb:48`) renders it with the
 * class name — `\underset` plus `latex_wrapped` per present field. (Its
 * constructor stores `{}` where `Overset` stores nothing — a census fact,
 * not a render one.)
 */

import { latexWrapped, type NodeOf, present, type RenderContext } from "./shared";

export function renderUnderset(node: NodeOf<"underset">, context: RenderContext): string {
  return `\\underset${
    present(node.parameterOne)
      ? latexWrapped(node.parameterOne, context, "underset.parameterOne")
      : ""
  }${present(node.parameterTwo) ? latexWrapped(node.parameterTwo, context, "underset.parameterTwo") : ""}`;
}
