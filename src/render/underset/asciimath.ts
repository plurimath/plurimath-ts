/**
 * Mirrors `function/underset.rb`, which defines no `to_asciimath` of its own:
 * `BinaryFunction#to_asciimath` (`binary_function.rb:15`) renders it with the
 * class name — `underset(…)(…)`. (Its constructor stores `{}` where
 * `Overset` stores nothing — a census fact, not a render one.)
 */

import { type NodeOf, type RenderContext, wrapped } from "../../formats/asciimath/render-shared";

export function renderUnderset(node: NodeOf<"underset">, context: RenderContext): string {
  return `underset${wrapped(node.parameterOne, context, "underset.parameterOne")}${wrapped(node.parameterTwo, context, "underset.parameterTwo")}`;
}
