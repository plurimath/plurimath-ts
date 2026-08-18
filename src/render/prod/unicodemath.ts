/**
 * Mirrors `function/prod.rb` — `Prod#to_unicodemath` (:104).
 *
 * **`mask` is read from the render options here, not from the node's own**, in
 * the one position where `Int`, `Oint` and `Sum` all read `self.options`. That
 * asymmetry looks like a gem bug, and it is ported faithfully rather than
 * repaired: PORTING-STANDARDS makes being more correct than the gem a defect.
 *
 * The render options carry no `mask` in any measured path, so this reads as
 * empty in practice — which is exactly why the divergence is invisible until
 * someone "fixes" it.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import {
  naryandSubValue,
  naryandSupValue,
  naryandValue,
} from "../../formats/unicodemath/render-shared";

/** U+220F N-ARY PRODUCT — `Prod#nary_attr_value` (`prod.rb:125`). */
const PRODUCT = "∏";

export function renderProd(node: NodeOf<"prod">, context: RenderContext): string {
  const sub = node.parameterOne === undefined ? "" : naryandSubValue(node.parameterOne, context);
  const sup = node.parameterTwo === undefined ? "" : naryandSupValue(node.parameterTwo, context);
  return `${PRODUCT}${sub}${sup}${naryandValue(node.parameterThree, context)}`;
}
