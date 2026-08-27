import { RenderError } from "../../core/index";
import {
  FORMAT,
  type NodeOf,
  type RenderContext,
  renderUnarySlot,
} from "../../formats/html/render-shared";

export function renderUnaryFunction(node: NodeOf<"unaryFunction">, context: RenderContext): string {
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

/** `UnaryFunction#to_html`: italicized measured label followed by one slot wrapper. */
export function renderUnaryDefault(
  measuredLabel: string,
  parameterOne: unknown,
  context: RenderContext,
  at: string,
): string {
  return `<i>${measuredLabel}</i>${renderUnarySlot(parameterOne, context, at)}`;
}
