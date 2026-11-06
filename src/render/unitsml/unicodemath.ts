/**
 * Function::Unitsml delegates to its expanded formula with the same render
 * options plus `unicodemath_unit: true`.
 */
import {
  expandUnitsml,
  type NodeOf,
  type RenderContext,
} from "../../formats/unicodemath/render-shared";

export function renderUnitsml(node: NodeOf<"unitsml">, context: RenderContext): string | null {
  return context.renderUnit(expandUnitsml(node.text, context.unitsml));
}
