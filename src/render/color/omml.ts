import { hasNodeKind, type MathNode, RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  type OmmlRendered,
  type RenderContext,
} from "../../formats/omml/render-shared";

/** The gem ignores the colour slot and options in OMML, inserting only slot two. */
export function renderColor(node: NodeOf<"color">, context: RenderContext): OmmlRendered {
  if (!hasNodeKind(node.parameterTwo)) {
    throw new RenderError(
      `color.parameterTwo: cannot insert ${describeSlot(node.parameterTwo)} — ` +
        "the gem raises NoMethodError here",
      FORMAT,
      node.kind,
    );
  }
  return context.insert(node.parameterTwo as MathNode);
}
