/**
 * Mirrors `function/mpadded.rb` — `Mpadded#to_asciimath` (:25): the inherited
 * `asciimath_value` alone — no name, no parens.
 */

import type { NodeOf, RenderContext } from "../../formats/asciimath/render-shared";
import { asciimathValue } from "../unary-function/asciimath";

export function renderMpadded(node: NodeOf<"mpadded">, context: RenderContext): string {
  return asciimathValue(node.parameterOne, context, "mpadded.parameterOne");
}
