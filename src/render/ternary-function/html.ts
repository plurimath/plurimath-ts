import { RenderError } from "../../core/index";
import {
  FORMAT,
  type NodeOf,
  type RenderContext,
  renderCarrierSlot,
} from "../../formats/html/render-shared";

export function renderTernaryFunction(
  node: NodeOf<"ternaryFunction">,
  _context: RenderContext,
): never {
  throw new RenderError(
    `TernaryFunction alias "${node.name}" has not been measured for HTML in this slice`,
    FORMAT,
    node.kind,
  );
}

/** `TernaryFunction#to_html`: each present slot gets its own `<i>` wrapper. */
export function renderTernaryDefault(
  parameterOne: unknown,
  parameterTwo: unknown,
  parameterThree: unknown,
  context: RenderContext,
  at: string,
): string {
  return (
    renderCarrierSlot(parameterOne, context, `${at}.parameterOne`) +
    renderCarrierSlot(parameterTwo, context, `${at}.parameterTwo`) +
    renderCarrierSlot(parameterThree, context, `${at}.parameterThree`)
  );
}
