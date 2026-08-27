import { hasNodeKind, RenderError } from "../../core/index";
import {
  baseSymbolValue,
  controlProperties,
  FORMAT,
  type NodeOf,
  type RenderContext,
  renderChild,
  requireElement,
  requireEmptyOptions,
  requireNodeList,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderTable(node: NodeOf<"table">, context: RenderContext): XmlElement {
  if (node.name !== undefined) {
    throw new RenderError(
      `Table alias "${node.name}" has not been measured for OMML in this slice`,
      FORMAT,
      node.kind,
    );
  }
  requireEmptyOptions(node.options, node.kind, "table.options");
  const rows = requireNodeList(node.value, node.kind, "table.value");
  if (rows.length === 0) {
    throw new RenderError("table.value: empty tables are unmeasured", FORMAT, node.kind);
  }

  const first = rows[0];
  const firstCells =
    typeof first === "object" && first !== null && !Array.isArray(first)
      ? (first as { readonly parameterOne?: unknown }).parameterOne
      : undefined;
  const columns = Array.isArray(firstCells) ? firstCells.length : 0;
  if (columns < 2) {
    throw new RenderError(
      "table.value: the single-column eqArr branch is deferred until separately measured",
      FORMAT,
      node.kind,
    );
  }

  const matrix = new XmlElement("m:m");
  const columnProperties = new XmlElement("m:mcPr").append(
    new XmlElement("m:count").setAttribute("m:val", String(columns)),
    new XmlElement("m:mcJc").setAttribute("m:val", "center"),
  );
  const matrixProperties = new XmlElement("m:mPr").append(
    new XmlElement("m:mcs").append(new XmlElement("m:mc").append(columnProperties)),
    controlProperties(),
  );
  matrix.append(matrixProperties);

  rows.forEach((row, index) => {
    const rowCells =
      typeof row === "object" && row !== null && !Array.isArray(row)
        ? (row as { readonly parameterOne?: unknown }).parameterOne
        : undefined;
    if (!Array.isArray(rowCells) || rowCells.length !== columns) {
      throw new RenderError(
        `table.value[${index}]: does not have the measured ${columns}-cell row shape`,
        FORMAT,
        node.kind,
      );
    }
    matrix.append(
      requireElement(
        renderChild(row, context, `table.value[${index}]`),
        node.kind,
        `table.value[${index}]`,
        "m:mr",
      ),
    );
  });

  const open = requireParenValue(node.openParen, node, "table.openParen");
  const close = requireParenValue(node.closeParen, node, "table.closeParen");
  const delimiterProperties = new XmlElement("m:dPr").append(
    new XmlElement("m:begChr").setAttribute("m:val", open),
    new XmlElement("m:endChr").setAttribute("m:val", close),
    new XmlElement("m:sepChr").setAttribute("m:val", ""),
    new XmlElement("m:grow"),
  );
  return new XmlElement("m:d").append(delimiterProperties, new XmlElement("m:e").append(matrix));
}

function requireParenValue(value: unknown, node: NodeOf<"table">, at: string): string {
  if (!hasNodeKind(value) || (value as { readonly kind: string }).kind !== "symbol") {
    throw new RenderError(
      `${at}: only the measured generic Symbol paren is implemented in this slice`,
      FORMAT,
      node.kind,
    );
  }
  return baseSymbolValue(value as NodeOf<"symbol">, node.kind, at);
}
