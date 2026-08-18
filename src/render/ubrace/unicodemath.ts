/**
 * Mirrors `function/ubrace.rb` — `Ubrace#to_unicodemath` (:60).
 *
 * Unlike `Obrace`, the gem guards `parameter_one` before parenthesising, so a
 * childless `Ubrace` renders as the bare bracket with no `()` after it.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { renderOptionalChild } from "../../formats/unicodemath/render-shared";

/** U+23DF BOTTOM CURLY BRACKET. */
const UBRACE = "⏟";

export function renderUbrace(node: NodeOf<"ubrace">, context: RenderContext): string {
  if (node.parameterOne === undefined) return UBRACE;
  return `${UBRACE}(${renderOptionalChild(node.parameterOne, context)})`;
}
