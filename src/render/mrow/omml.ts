import type { NodeOf, OmmlRendered, RenderContext } from "../../formats/omml/render-shared";
import { renderFormulaContent } from "../formula/omml";

/** `Mrow` inherits `Formula#to_omml_without_math_tag` unchanged. */
export function renderMrow(node: NodeOf<"mrow">, context: RenderContext): OmmlRendered {
  return renderFormulaContent(node.value, context, "mrow");
}
