/**
 * Mirrors `function/ternary_function.rb` — which defines **no** `to_unicodemath`, and
 * neither does `Math::Core`.
 *
 * A bare `TernaryFunction` instance raises `NoMethodError` in the gem: every concrete
 * subclass supplies its own. So this carrier refuses rather than inventing a
 * fallback, which is the port's equivalent of that `NoMethodError` and keeps
 * a missing subclass visible instead of silently rendering something plausible.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { missingRenderer } from "../../formats/unicodemath/render-shared";

export function renderTernaryFunction(
  node: NodeOf<"ternaryFunction">,
  _context: RenderContext,
): string | null {
  throw missingRenderer(node.name, "ternaryFunction");
}
