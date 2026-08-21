/**
 * Mirrors `function/sqrt.rb` — `Sqrt#to_unicodemath` (:42).
 *
 * The gem does not guard `parameter_one`, and neither does
 * `unicodemath_parens`: its first line calls `field.to_unicodemath` before the
 * trailing `if field`, so a nil root RAISES rather than rendering a bare
 * radical. Measured on the pinned oracle:
 *
 *   Sqrt.new(nil).to_unicodemath  !! NoMethodError: undefined method
 *                                    'to_unicodemath' for nil
 *
 * An earlier version of this file asserted the opposite in prose and rendered
 * `"√"`, which is the "more correct than the oracle" defect
 * PORTING-STANDARDS.md forbids. The crash maps to `RenderError` (§5).
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { unicodemathParens } from "../../formats/unicodemath/render-shared";

/** U+221A SQUARE ROOT. */
const RADICAL = "√";

export function renderSqrt(node: NodeOf<"sqrt">, context: RenderContext): string {
  return `${RADICAL}${unicodemathParens(node.parameterOne, context) ?? ""}`;
}
