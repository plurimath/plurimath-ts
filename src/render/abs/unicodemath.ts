/**
 * Mirrors `function/abs.rb` — `Abs#to_unicodemath` (:38).
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { unicodemathParens } from "../../formats/unicodemath/render-shared";

/** U+24DC CIRCLED LATIN SMALL LETTER A — UnicodeMath's `abs` operator. */
const ABS = "⒜";

export function renderAbs(node: NodeOf<"abs">, context: RenderContext): string {
  return `${ABS}${unicodemathParens(node.parameterOne, context) ?? ""}`;
}
