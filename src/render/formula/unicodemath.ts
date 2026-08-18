/**
 * Mirrors `formula.rb` — `Formula#to_unicodemath` (:187) and
 * `Formula#unicodemath_value` (:486).
 *
 * This is the only kind whose renderer is a *boundary* rather than a node
 * rendering: it joins its children, decodes HTML entities, and collapses
 * `" / "` to `"/"`. LaTeX and MathML do neither.
 *
 * The join separator is a space **unless** the formula is negated or
 * mini-sized, both of which are questions asked of its children — see
 * `render-shared.ts` for why those predicates live there.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { formulaBoundary } from "../../formats/unicodemath/render-shared";

export function renderFormula(node: NodeOf<"formula">, context: RenderContext): string | null {
  return formulaBoundary(node, context);
}
