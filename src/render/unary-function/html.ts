import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  type RenderContext,
  renderChild,
  renderUnarySlot,
  s,
} from "../../formats/html/render-shared";

export function renderUnaryFunction(node: NodeOf<"unaryFunction">, context: RenderContext): string {
  if (node.name === "Tr") return renderTr(node.parameterOne, context);
  if (node.name !== "Sin") {
    throw new RenderError(
      `UnaryFunction alias "${node.name}" has not been measured for HTML in this slice`,
      FORMAT,
      node.kind,
    );
  }
  return renderUnaryDefault(
    node.name.toLowerCase(),
    node.parameterOne,
    context,
    "unaryFunction.parameterOne",
  );
}

/** `Tr#to_html`: table cells joined with no separator inside one row tag. */
function renderTr(value: unknown, context: RenderContext): string {
  if (!Array.isArray(value)) {
    throw new RenderError(
      `Tr.parameterOne: is ${describeSlot(value)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      "unaryFunction",
    );
  }
  const inner = value
    .map((item, index) => s(renderChild(item, context, `Tr.parameterOne[${index}]`)))
    .join("");
  return `<tr>${inner}</tr>`;
}

/** `UnaryFunction#to_html`: italicized measured label followed by one slot wrapper. */
export function renderUnaryDefault(
  measuredLabel: string,
  parameterOne: unknown,
  context: RenderContext,
  at: string,
): string {
  return `<i>${measuredLabel}</i>${renderUnarySlot(parameterOne, context, at)}`;
}
