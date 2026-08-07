/**
 * Mirrors `function/overset.rb`, which defines no `to_asciimath` of its own:
 * `BinaryFunction#to_asciimath` (`binary_function.rb:15`) renders it with the
 * class name — `overset(…)(…)`.
 */

import { type NodeOf, type RenderContext, wrapped } from "../../formats/asciimath/render-shared";

export function renderOverset(node: NodeOf<"overset">, context: RenderContext): string {
  return `overset${wrapped(node.parameterOne, context, "overset.parameterOne")}${wrapped(node.parameterTwo, context, "overset.parameterTwo")}`;
}
