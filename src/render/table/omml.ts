import { hasNodeKind, RenderError } from "../../core/index";
import {
  baseSymbolValue,
  controlProperties,
  FORMAT,
  type NodeOf,
  type OmmlRendered,
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

  // `Table#single_table?` (table.rb:385-390) picks the `m:eqArr` branch:
  //
  //     value.map { |d| d.parameter_one.length == 1 }.all? &&
  //       nil_option?(:frame) && nil_option?(:columnlines) && nil_option?(:rowlines)
  //
  // EVERY row must hold exactly one cell, not just the first. The three
  // options are already settled above: `requireEmptyOptions` refuses anything
  // but an absent or empty options hash, and an absent option is what
  // `nil_option?` accepts (it also accepts `""` and `"none"`), so the row
  // widths alone decide the branch here. Measured on the oracle at
  // `00c52783`: rows of 1 and 1 cell give `m:eqArr`, rows of 1 and 2 give
  // `m:m` — the shape this guard used to misread as single-column.
  //
  // A table with no rows reaches the same branch: `[].all?` is true in Ruby as
  // `[].every` is in JavaScript, and the gem renders `Table.new([])` as an
  // `m:eqArr` carrying only its `m:eqArrPr`. It refused separately here as
  // "empty tables are unmeasured", which split one gem path across two port
  // refusals and reported the wrong reason for the emptier of them.
  if (rows.every((row) => cellCount(row) === 1)) {
    throw new RenderError(
      "table.value: the single-column eqArr branch is deferred until separately measured",
      FORMAT,
      node.kind,
    );
  }

  // `multiple_td_table` (table.rb:298) takes `m:count` from the FIRST row
  // alone — `value&.first&.parameter_one&.count` — and never compares it with
  // any other row. A ragged matrix therefore counts its first row's cells:
  // measured, rows of 1 and 2 cells give `<m:count m:val="1"/>`.
  const columns = cellCount(rows[0]) ?? 0;

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
    matrix.append(
      requireRowContent(
        renderChild(row, context, `table.value[${index}]`),
        node.kind,
        `table.value[${index}]`,
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

/**
 * A row's cell count for `single_table?` and `m:count`. The gem reads
 * `d.parameter_one.length`, which answers only for a row whose slot holds a
 * list; anything else is left to fail loudly when that row is rendered.
 */
function cellCount(row: unknown): number | undefined {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return undefined;
  const cells = (row as { readonly parameterOne?: unknown }).parameterOne;
  return Array.isArray(cells) ? cells.length : undefined;
}

/**
 * The two shapes a row renders to, both measured on the oracle at `00c52783`:
 * `Tr` answers with `m:mr` for every cell count but one, and with the bare
 * `m:e` list for exactly one (`src/render/unary-function/omml.ts`). The gem's
 * `multiple_td_table` flattens whichever it gets straight into `m:m`, so both
 * are accepted and anything else refuses rather than guessing markup.
 */
function requireRowContent(rendered: OmmlRendered, kind: string, at: string): OmmlRendered {
  if (rendered instanceof XmlElement) return requireElement(rendered, kind, at, "m:mr");
  if (
    Array.isArray(rendered) &&
    rendered.every((cell) => cell instanceof XmlElement && cell.name === "m:e")
  ) {
    return rendered;
  }
  throw new RenderError(
    `${at}: did not render the measured m:mr row or m:e cell list`,
    FORMAT,
    kind,
  );
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
