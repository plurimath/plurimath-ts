import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  type RenderContext,
  renderChild,
  s,
} from "../../formats/html/render-shared";

/** `Formula#to_html`: render each child and join with one literal space. */
export function renderFormula(node: NodeOf<"formula">, context: RenderContext): string {
  if (node.name !== undefined) {
    throw new RenderError(
      `Formula alias "${node.name}" has not been measured for HTML in this slice`,
      FORMAT,
      node.kind,
    );
  }
  return renderFormulaValue(node.value, context, "formula");
}

export function renderFormulaValue(value: unknown, context: RenderContext, at: string): string {
  if (!Array.isArray(value)) {
    throw new RenderError(
      `${at}.value: is ${describeSlot(value)}, not a list — the gem raises here`,
      FORMAT,
      at,
    );
  }
  return value
    .map((item, index) => s(renderChild(item, context, `${at}.value[${index}]`)))
    .join(" ");
}
