/**
 * Mirrors `formula/mrow.rb`, which defines no `to_mathml_without_math_tag`
 * of its own: `Formula#to_mathml_without_math_tag` (`formula.rb:121`)
 * renders it — `Mrow` is a `Formula` subclass, and inherits the
 * wrap-or-splice body unchanged (probes mrow-node / mrow-nowrap).
 */

import type { MathmlRendered, NodeOf, RenderContext } from "../../formats/mathml/render-shared";
import { renderFormulaMathml } from "../formula/mathml";

export function renderMrow(node: NodeOf<"mrow">, context: RenderContext): MathmlRendered {
  return renderFormulaMathml(node.value, node.leftRightWrapper, context, "mrow");
}
