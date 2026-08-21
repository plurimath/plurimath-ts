/**
 * Mirrors `function/ul.rb` — `Ul#to_unicodemath` (:52).
 *
 * `Ul` also overrides `class_name` to `"underline"` (`function/ul.rb:56`), which the
 * unary-function carrier would use — but `Ul` overrides `to_unicodemath` too,
 * so that name never reaches this path. Ported as dead, not repaired.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { unicodemathParens } from "../../formats/unicodemath/render-shared";

/** U+2581 LOWER ONE EIGHTH BLOCK. */
const UNDERLINE = "▁";

export function renderUl(node: NodeOf<"ul">, context: RenderContext): string {
  return `${UNDERLINE}${unicodemathParens(node.parameterOne, context) ?? ""}`;
}
