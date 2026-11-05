/**
 * Function::Unitsml delegates to its expanded formula with the same render
 * options, plus `unicodemath_unit: true` (`unitsml.rb`), which makes a
 * multi-letter unit symbol come out as quoted upright text (see
 * `../font-style/unicodemath.ts`).
 */
import {
  expandUnitsml,
  type NodeOf,
  type RenderContext,
} from "../../formats/unicodemath/render-shared";

export function renderUnitsml(node: NodeOf<"unitsml">, context: RenderContext): string | null {
  const unitContext = context.withUnicodemathUnit();
  return unitContext.render(expandUnitsml(node.text, unitContext.unitsml));
}
