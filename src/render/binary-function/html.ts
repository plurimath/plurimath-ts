import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  type RenderContext,
  renderCarrierSlot,
  renderChild,
  s,
} from "../../formats/html/render-shared";

export function renderBinaryFunction(
  node: NodeOf<"binaryFunction">,
  context: RenderContext,
): string {
  if (node.name === "Td") return renderTd(node.parameterOne, context);
  throw new RenderError(
    `BinaryFunction alias "${node.name}" has not been measured for HTML in this slice`,
    FORMAT,
    node.kind,
  );
}

/** `Td#to_html`: cell children joined with no separator; attributes are ignored. */
function renderTd(value: unknown, context: RenderContext): string {
  if (!Array.isArray(value)) {
    throw new RenderError(
      `Td.parameterOne: is ${describeSlot(value)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      "binaryFunction",
    );
  }
  const inner = value
    .map((item, index) => s(renderChild(item, context, `Td.parameterOne[${index}]`)))
    .join("");
  return `<td>${inner}</td>`;
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
