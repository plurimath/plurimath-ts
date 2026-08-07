/**
 * Mirrors `function/mpadded.rb` — `Mpadded#to_latex` (:29): the inherited
 * `latex_value` alone (`unary_function.rb:221`, `./unary-function.ts`) — no
 * command, no braces. Nil in, Ruby-nil out.
 */

import type { NodeOf, RenderContext } from "./shared";
import { latexValue } from "./unary-function";

export function renderMpadded(node: NodeOf<"mpadded">, context: RenderContext): string | null {
  return latexValue(node.parameterOne, context, "mpadded.parameterOne");
}
