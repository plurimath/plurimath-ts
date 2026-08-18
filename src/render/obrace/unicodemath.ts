/**
 * Mirrors `function/obrace.rb` — `Obrace#to_unicodemath` (:56).
 *
 * Always parenthesised, and not through `unicodemath_parens`: the gem writes
 * the parens literally, so a `Fenced` child gets them too rather than being
 * left to supply its own.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { renderOptionalChild } from "../../formats/unicodemath/render-shared";

/** U+23DE TOP CURLY BRACKET. */
const OBRACE = "⏞";

export function renderObrace(node: NodeOf<"obrace">, context: RenderContext): string {
  const inner = renderOptionalChild(node.parameterOne, context);
  return `${OBRACE}(${inner})`;
}
