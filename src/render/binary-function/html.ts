import { RenderError } from "../../core/index";
import {
  FORMAT,
  type NodeOf,
  type RenderContext,
  renderCarrierSlot,
} from "../../formats/html/render-shared";

export function renderBinaryFunction(
  node: NodeOf<"binaryFunction">,
  _context: RenderContext,
): never {
  throw new RenderError(
    `BinaryFunction alias "${node.name}" has not been measured for HTML in this slice`,
    FORMAT,
    node.kind,
  );
}

/** `BinaryFunction#to_html`: each present slot gets its own `<i>` wrapper. */
export function renderBinaryDefault(
  parameterOne: unknown,
  parameterTwo: unknown,
  context: RenderContext,
  at: string,
): string {
  return (
    renderCarrierSlot(parameterOne, context, `${at}.parameterOne`) +
    renderCarrierSlot(parameterTwo, context, `${at}.parameterTwo`)
  );
}
