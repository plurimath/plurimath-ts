/** Function::Unitsml delegates to its expanded formula with the same render options. */
import { expandUnitsml, type NodeOf, type RenderContext } from "../../formats/latex/render-shared";

export function renderUnitsml(node: NodeOf<"unitsml">, context: RenderContext): string | null {
  return context.render(expandUnitsml(node.text, context.unitsml));
}
