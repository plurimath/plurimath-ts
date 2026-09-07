import { hasNodeKind, type MathNode, RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  type OmmlRendered,
  type RenderContext,
} from "../../formats/omml/render-shared";

/** Direct OMML emits no break node: nil disappears; a value is inserted unchanged. */
export function renderLinebreak(node: NodeOf<"linebreak">, context: RenderContext): OmmlRendered {
  if (node.parameterOne === null || node.parameterOne === undefined) return null;
  if (!hasNodeKind(node.parameterOne)) {
    throw new RenderError(
      `linebreak.parameterOne: cannot insert ${describeSlot(node.parameterOne)} — ` +
        "the gem raises NoMethodError here",
      FORMAT,
      node.kind,
    );
  }
  return context.insert(node.parameterOne as MathNode);
}
