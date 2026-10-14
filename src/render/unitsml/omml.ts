/** Function::Unitsml delegates to its expanded formula with the same render options. */
import {
  expandUnitsml,
  type NodeOf,
  type OmmlRendered,
  type RenderContext,
} from "../../formats/omml/render-shared";

export function renderUnitsml(node: NodeOf<"unitsml">, context: RenderContext): OmmlRendered {
  return context.render(expandUnitsml(node.text, context.unitsml));
}
