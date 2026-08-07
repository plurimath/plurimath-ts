/**
 * Mirrors `function/norm.rb` — `Norm#to_asciimath` (:9): a `Table` keeps its
 * own brackets, no parens added; anything else is `super` — the carrier
 * default (`renderUnaryDefault` in `./unary-function.ts`).
 */

import { type NodeOf, type RenderContext, renderChild, s, slotKind } from "./shared";
import { renderUnaryDefault } from "./unary-function";

export function renderNorm(node: NodeOf<"norm">, context: RenderContext): string {
  if (slotKind(node.parameterOne) === "table") {
    return `norm${s(renderChild(node.parameterOne, context, "norm.parameterOne"))}`;
  }
  return renderUnaryDefault("norm", node.parameterOne, context);
}
