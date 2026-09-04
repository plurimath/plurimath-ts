import { RenderError } from "../../core/index";
import {
  FORMAT,
  insertChild,
  type NodeOf,
  type OmmlRendered,
  type RenderContext,
  requireNodeList,
} from "../../formats/omml/render-shared";

/** `Formula#to_omml_without_math_tag` delegates to `omml_content`. */
export function renderFormula(node: NodeOf<"formula">, context: RenderContext): OmmlRendered {
  if (node.name !== undefined) {
    throw new RenderError(
      `Formula alias "${node.name}" has not been measured for OMML in this slice`,
      FORMAT,
      node.kind,
    );
  }
  return renderFormulaContent(node.value, context, "formula");
}

export function renderFormulaContent(
  value: unknown,
  context: RenderContext,
  at: string,
): OmmlRendered {
  return requireNodeList(value, at, `${at}.value`).map((item, index) =>
    insertChild(item, context, `${at}.value[${index}]`),
  );
}
