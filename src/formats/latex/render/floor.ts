/**
 * Mirrors `function/floor.rb` — `Floor#to_latex` (:9):
 * `"{\\lfloor #{parameter_one.to_latex} \\rfloor}"` — `parameter_one` is
 * read unguarded, so nil crashes in the gem (NoMethodError) and raises
 * `RenderError` here, where `Ceil`'s `latex_value` would have interpolated
 * it away (`./ceil.ts`).
 */

import { type NodeOf, type RenderContext, renderChild, s } from "./shared";

export function renderFloor(node: NodeOf<"floor">, context: RenderContext): string {
  return `{\\lfloor ${s(renderChild(node.parameterOne ?? null, context, "floor.parameterOne"))} \\rfloor}`;
}
