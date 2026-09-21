import { hasNodeKind, RenderError } from "../../core/index";
import {
  controlProperties,
  decodeEntities,
  describeSlot,
  FORMAT,
  type NodeOf,
  type OmmlRendered,
  type RenderContext,
  renderChild,
  requireElement,
  requireNodeList,
  structuralProperties,
  symbolOmmlValue,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

/**
 * The ten `Table` subclasses (`function/table/*.rb`). None of them defines
 * `to_omml_without_math_tag`, so every alias renders through `Table`'s own —
 * measured on the oracle at `00c52783`: `Matrix`, `Array`, `Cases` and `Vmatrix`
 * built with their default parens, and `Vmatrix` with none, give the base
 * table's bytes for the same value and parens. What separates an alias in OMML
 * is therefore only the parens its constructor defaults to
 * (`Matrix` `(`/`)`, `Array` `[`/`]`, `Cases` `{`/`:}`), which arrive on the
 * node, never from the name. An alias outside this list is a name the gem has
 * no class for and stays refused.
 */
const TABLE_ALIASES: ReadonlySet<string> = new Set([
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

export function renderTable(node: NodeOf<"table">, context: RenderContext): XmlElement {
  if (node.name !== undefined && !TABLE_ALIASES.has(node.name)) {
    throw new RenderError(
      `Table alias "${node.name}" has not been measured for OMML in this slice`,
      FORMAT,
      node.kind,
    );
  }
  const rows = requireNodeList(node.value, node.kind, "table.value");

  // `Table#single_table?` (table.rb:385-390) picks the `m:eqArr` branch:
  //
  //     value.map { |d| d.parameter_one.length == 1 }.all? &&
  //       nil_option?(:frame) && nil_option?(:columnlines) && nil_option?(:rowlines)
  //
  // EVERY row must hold exactly one cell, not just the first. Measured on the
  // oracle at `00c52783`: rows of 1 and 1 cell give `m:eqArr`, rows of 1 and 2
  // give `m:m` — the shape this guard used to misread as single-column.
  //
  // `nil_option?` (table.rb:392-396) reads `options[option]`, so it is where a
  // nil or non-hash options slot raises — and only when every row is one cell,
  // because `&&` never evaluates it otherwise. Measured: `Table.new([tr], nil,
  // nil, nil)` raises with one cell per row and renders `m:m` with two. Any
  // other key in the hash is never read: `{columnalign: "left"}` still gives
  // `m:eqArr`, and `{frame: "solid"}`, `{columnlines: "solid"}` give `m:m`
  // (measured).
  //
  // A table with no rows reaches the same branch: `[].all?` is true in Ruby as
  // `[].every` is in JavaScript, and the gem renders `Table.new([])` as an
  // `m:eqArr` carrying only its `m:eqArrPr`.
  if (
    rows.every((row) => cellCount(row) === 1) &&
    (["frame", "columnlines", "rowlines"] as const).every((option) =>
      nilOption(node.options, option, node.kind),
    )
  ) {
    return fencedTable(renderSingleColumn(rows, context), node);
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

  return fencedTable(matrix, node);
}

/**
 * `Table#single_td_table` (table.rb:286-296):
 *
 * ```ruby
 * eqarr   = XmlHelper.ox_element("eqArr", namespace: "m")
 * eqarrpr = XmlHelper.ox_element("eqArrPr", namespace: "m")
 * eqarrpr << XmlHelper.pr_element("ctrl", true, namespace: "m")
 * eqarr   << eqarrpr
 * tr_value = value.map { |o| o.to_omml_without_math_tag(...) }.flatten
 * XmlHelper.update_nodes(eqarr, tr_value.compact)
 * ```
 *
 * Every row is rendered and its answer is flattened straight in, with no shape
 * check of any kind — `m:m` gets `requireRowContent` because a matrix's rows
 * are read for their width, and this branch reads nothing. So a one-cell `Tr`
 * contributes its bare `<m:e>` list and a `Td` row its single `m:e`, both
 * measured on the oracle at `00c52783`, and `append` reproduces
 * `flatten.compact` exactly (nested lists recursed, nil skipped).
 *
 * A table with NO rows reaches this branch too, and is the shape that shows
 * the properties element is unconditional: `Table.new([])` renders an
 * `m:eqArr` carrying only its `m:eqArrPr` (measured).
 */
function renderSingleColumn(rows: readonly unknown[], context: RenderContext): XmlElement {
  const rowArray = new XmlElement("m:eqArr").append(structuralProperties("eqArr"));
  rows.forEach((row, index) => {
    rowArray.append(renderChild(row, context, `table.value[${index}]`));
  });
  return rowArray;
}

/**
 * `Table#fenced_table` (table.rb:342-351) and `mdpr_node` below it: the
 * delimiter wrapper both table shapes are handed to.
 */
function fencedTable(table: XmlElement, node: NodeOf<"table">): XmlElement {
  // `return ox_table unless open_paren || close_paren`: no parens at all is the
  // bare table. A paren the node does not hold contributes no `begChr` or
  // `endChr` (`begchr`/`endchr` return nil, which `update_nodes` skips) —
  // measured for an open-only and a close-only table.
  if (!isPresent(node.openParen) && !isPresent(node.closeParen)) return table;
  const open = isPresent(node.openParen)
    ? requireParenValue(node.openParen, node, "table.openParen")
    : null;
  const close = isPresent(node.closeParen)
    ? requireParenValue(node.closeParen, node, "table.closeParen")
    : null;
  const delimiterProperties = new XmlElement("m:dPr").append(
    open === null ? null : new XmlElement("m:begChr").setAttribute("m:val", open),
    close === null ? null : new XmlElement("m:endChr").setAttribute("m:val", close),
    new XmlElement("m:sepChr").setAttribute("m:val", ""),
    new XmlElement("m:grow"),
  );
  return new XmlElement("m:d").append(delimiterProperties, new XmlElement("m:e").append(table));
}

/** Ruby truthiness of a paren slot: only nil and `false` are absent. */
function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

/**
 * `Table#nil_option?` (table.rb:392-396): `options[option].nil? ||
 * options[option] == "" || options[option] == "none"`. The hash read is what
 * fails for a slot that is not a hash — nil (`NoMethodError`) and a String,
 * Array or `false` (`TypeError`/`NoMethodError`), all measured as raising.
 */
function nilOption(options: unknown, option: string, kind: string): boolean {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new RenderError(
      `table.options: is ${describeSlot(options)}, not a hash — the gem raises reading options[:${option}]`,
      FORMAT,
      kind,
    );
  }
  const value = (options as Readonly<Record<string, unknown>>)[option];
  return value === null || value === undefined || value === "" || value === "none";
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
  // `Table#paren` is `parenthesis.to_omml_without_math_tag(true)`
  // (`table.rb:375-377`) — the representation itself, NOT `t_tag`, so a named
  // paren answers its generated literal and its stored value is never read.
  // The literal is then decoded ONCE on its way into the attribute, as
  // `update_attrs` does for every attribute the gem writes: `Paren::Norm`'s
  // `&#x2016;` reaches the document as `‖` (measured, `\begin{Vmatrix}a\end{Vmatrix}`).
  return decodeEntities(symbolOmmlValue(value as NodeOf<"symbol">, node.kind, at), node.kind, at);
}
