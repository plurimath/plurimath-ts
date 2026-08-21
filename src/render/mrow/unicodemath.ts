/**
 * Mirrors `formula/mrow.rb` — which defines no `to_unicodemath` and inherits
 * `Formula`'s (`formula.rb:187`).
 *
 * That inheritance is the trap. `Mrow` inherits the formula **entry point**,
 * not the child path, so a nested `Mrow` re-runs option seeding, HTML entity
 * decoding and the `" / "` collapse at its own level as well as at every
 * enclosing one. That is only safe because the decode is idempotent, which was
 * measured rather than assumed.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { formulaBoundary } from "../../formats/unicodemath/render-shared";

export function renderMrow(node: NodeOf<"mrow">, context: RenderContext): string | null {
  return formulaBoundary(node, context);
}
