import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  type RenderContext,
  renderChild,
  s,
} from "../../formats/html/render-shared";

const MEASURED_NAMES: ReadonlySet<string> = new Set([
  "Align",
  "Array",
  "Bmatrix",
  "Cases",
  "Eqarray",
  "Matrix",
  "Multline",
  "Pmatrix",
  "Split",
  "Vmatrix",
]);

/** `Table#to_html`: all measured aliases ignore parens/options and emit the same tree. */
export function renderTable(node: NodeOf<"table">, context: RenderContext): string {
  if (node.name !== undefined && !MEASURED_NAMES.has(node.name)) {
    throw new RenderError(
      `Table alias "${node.name}" has not been measured for HTML`,
      FORMAT,
      node.kind,
    );
  }
  if (!Array.isArray(node.value)) {
    throw new RenderError(
      `table.value: is ${describeSlot(node.value)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      node.kind,
    );
  }
  const inner = node.value
    .map((item, index) => s(renderChild(item, context, `table.value[${index}]`)))
    .join("");
  return `<table>${inner}</table>`;
}
