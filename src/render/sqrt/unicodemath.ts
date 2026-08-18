/**
 * Mirrors `function/sqrt.rb` — `Sqrt#to_unicodemath` (:42).
 *
 * The gem does not guard `parameter_one`, and `unicodemath_parens` returns nil
 * for a nil field, so a rootless sqrt renders as the bare radical. Measured on
 * the pinned oracle: `sqrt(` crashes in the gem before reaching here, which is
 * why the adversarial gate records it as a `RenderError` rather than output.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { unicodemathParens } from "../../formats/unicodemath/render-shared";

/** U+221A SQUARE ROOT. */
const RADICAL = "√";

export function renderSqrt(node: NodeOf<"sqrt">, context: RenderContext): string {
  return `${RADICAL}${unicodemathParens(node.parameterOne, context) ?? ""}`;
}
