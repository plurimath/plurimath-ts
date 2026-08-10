/**
 * Mirrors `function/table.rb` — `Table#to_latex` (:79), `#table_attribute`
 * (:215), `#latex_content` (:253), `#matrix_class` (:257) and
 * `#latex_columnalign` (:270) — and the carrier name arms the census folds
 * in: `table/matrix.rb` (:22) with its six `\begin{env}` siblings
 * (`align.rb`, `bmatrix.rb`, `multline.rb`, `pmatrix.rb`, `split.rb`,
 * `vmatrix.rb`, each :15) and `table/array.rb` (:15). `Cases` and `Eqarray`
 * have no override and take the generic path.
 *
 * Measured pins worth naming, because source-reading gets them wrong: a bare
 * `Table` with a NIL open paren takes the gem's `environment == "array"`
 * path (`MATRICES.invert[nil]` is `:array`) and inserts a `{aa…|…}` column
 * descriptor; with any open paren present it does not. `Paren::Norm` as open
 * paren short-circuits to `\begin{Vmatrix}`. Named tables render
 * `\begin{env}` with env from the open paren's `to_matrices` (a five-row
 * measured map; any other paren raises NoMethodError in the gem →
 * RenderError here), falling back to the lowercased class name when the
 * paren is nil.
 */

import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  isNode,
  isPipeSymbol,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
  unreachableName,
} from "../../formats/latex/render-shared";
import {
  LATEX_ALIGNMENT_LETTERS,
  LATEX_MATRIX_ENVIRONMENTS,
} from "../../generated/latex/render-tables";

/**
 * `Latex::Constants::MATRICES.invert[open_paren.to_matrices]` — which
 * environment a named table's open paren selects, generated through a
 * `Table::Matrix` render per paren. Only these five parens define
 * `to_matrices`; any other open paren raises NoMethodError in the gem
 * (verified at generation), RenderError here.
 */
const MATRIX_ENVIRONMENTS: ReadonlyMap<string, string> = LATEX_MATRIX_ENVIRONMENTS;

/** The table names rendering `\begin{env}…\end{env}` through that map. */
const MATRIX_STYLE_TABLE_NAMES: ReadonlySet<string> = new Set([
  "Matrix",
  "Align",
  "Bmatrix",
  "Multline",
  "Pmatrix",
  "Split",
  "Vmatrix",
]);

/**
 * `Utility::ALIGNMENT_LETTERS.invert`, generated through `Table::Array`
 * columnalign renders: left→l, right→r, center→c, anything else nil
 * (skipped in `array_args`, `[]` in `latex_columnalign`).
 */
const ALIGNMENT_LETTERS: ReadonlyMap<string, string> = LATEX_ALIGNMENT_LETTERS;

/**
 * The class names this carrier has measured behaviour for — every `Table`
 * subclass in the gem (probe-latex-name-guards.rb on the pinned oracle,
 * 2026-08-10: exactly these 10 — 8 overriding `to_latex`, `Cases` and
 * `Eqarray` inheriting it). The AsciiMath transform builds only bare tables,
 * so like the asciimath table carrier's set this one is not derivable from
 * the transform registry; it is hand-listed, and every entry is pinned by a
 * behavioural render in `test/formats/latex/renderer.spec.ts` ("renders
 * every aliased subclass with its constructor parens as the gem does") —
 * dropping one from this set turns that pin red. A defined name outside the
 * set raises before dispatch, because rendering the generic-table default
 * for an unmeasured class would diverge silently (`unreachableName` in
 * `../../formats/latex/render-shared.ts`).
 */
const MEASURED_TABLE_NAMES: ReadonlySet<string> = new Set([
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

export function renderTable(node: NodeOf<"table">, context: RenderContext): string {
  const name = node.name;
  if (name !== undefined && !MEASURED_TABLE_NAMES.has(name)) throw unreachableName(node.kind, name);
  if (name !== undefined && MATRIX_STYLE_TABLE_NAMES.has(name))
    return renderMatrixTable(node, name, context);
  if (name === "Array") return renderArrayTable(node, context);
  // The bare carrier, `Cases` and `Eqarray` — no override in the gem — take
  // `Table#to_latex` (`table.rb:79`).
  return renderGenericTable(node, context);
}

/**
 * `Matrix#to_latex` and its six siblings: `\begin{env}…\end{env}`, env from
 * the open paren (`matrix_class`, `table.rb:257`) or the lowercased class
 * name when the paren is nil. `options.key?(:asterisk)` stars the env;
 * a TRUTHY asterisk also emits `[alignment]` from the first td's
 * columnalign (`latex_columnalign`, `table.rb:270`).
 */
function renderMatrixTable(node: NodeOf<"table">, name: string, context: RenderContext): string {
  let env: string;
  if (node.openParen === null || node.openParen === undefined) {
    env = name.toLowerCase();
  } else {
    const id =
      isNode(node.openParen) && node.openParen.kind === "symbol" ? node.openParen.id : undefined;
    const mapped = id === undefined ? undefined : MATRIX_ENVIRONMENTS.get(id);
    if (mapped === undefined) {
      throw new RenderError(
        `table.openParen: ${describeSlot(node.openParen)}${id === undefined ? "" : ` (id "${id}")`} ` +
          "defines no to_matrices — the gem raises NoMethodError here",
        FORMAT,
        node.kind,
      );
    }
    env = mapped;
  }
  const options = node.options;
  // `options&.key?(:asterisk)` (`matrix_class`, `table.rb:257`) is a send, and
  // `&.` guards nil ALONE: a string, a number, `true`, `FALSE`, a list (the
  // empty one included) and a node all reach `key?` and raise
  // `NoMethodError: undefined method 'key?' for <the value>` — probed per
  // shape on the pinned oracle (00c52783, ruby 4.0.1, 2026-08-10), through the
  // constructor argument and a forced `@options` ivar alike. Only a hash
  // answers, so everything else is `RenderError` here — never the silent
  // no-asterisk render `Object.hasOwn` on a primitive produced, which dropped
  // both the `*` and the `[…]` the gem never got far enough to decide.
  if (options !== null && options !== undefined && !isRubyHash(options)) {
    throw new RenderError(
      `table.options: holds ${describeSlot(options)} — the gem sends ` +
        "options&.key?(:asterisk), which only a hash answers (NoMethodError there)",
      FORMAT,
      node.kind,
    );
  }
  const starred = options !== null && options !== undefined && Object.hasOwn(options, "asterisk");
  const matrixClass = starred ? `{${env}*}` : `{${env}}`;
  let columnalign = "";
  if (starred && present(options.asterisk)) {
    columnalign = `[${s(firstTdColumnAlignment(node))}]`;
  }
  return `\\begin${matrixClass}${columnalign}${latexContent(node, context)}\\end${matrixClass}`;
}

/** A Ruby `Hash` at this port's boundary: a plain record, never a list or node. */
function isRubyHash(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !isNode(value);
}

/**
 * `Hash(…)[:columnalign]` — the alignment read shared by the starred matrix
 * environment (`latex_columnalign`, `table.rb:270`, over `td_hash`) and the
 * array column descriptor (`array_args`, `array.rb:36`, per td).
 *
 * `Kernel#Hash` converts exactly three things — a hash, nil, and the EMPTY
 * list — and raises `TypeError: can't convert <Class> into Hash` for
 * everything else. Probed per shape through BOTH readers on the pinned oracle
 * (00c52783, ruby 4.0.1, 2026-08-10): `"left"`, `""`, `5`, `1.5`, `true`,
 * `false`, `["left"]`, `[[:columnalign, "left"]]` and a `Number` instance all
 * raise; `{}`, nil, an absent ivar and `[]` all render the no-alignment form
 * (`[]` on the matrix side, `.` on the array side). So an empty list answers
 * "no alignment" here and every other non-hash raises — never the silent null
 * the matrix side used to return, and never the loud refusal the array side
 * gave the empty list.
 */
function columnAlignment(parameterTwo: unknown, kind: string): string | null {
  if (parameterTwo === null || parameterTwo === undefined) return null;
  const emptyList = Array.isArray(parameterTwo) && parameterTwo.length === 0;
  if (!emptyList && !isRubyHash(parameterTwo)) {
    throw new RenderError(
      `table.value: a td's parameter_two holds ${describeSlot(parameterTwo)} — the gem's ` +
        "Hash() converts a hash, nil and the empty list alone (TypeError there)",
      FORMAT,
      kind,
    );
  }
  const align = (parameterTwo as { readonly columnalign?: unknown }).columnalign;
  return typeof align === "string" ? (ALIGNMENT_LETTERS.get(align) ?? null) : null;
}

/** `td_hash` (`table.rb:276`): `value&.first&.parameter_one&.first&.parameter_two`. */
function firstTdColumnAlignment(node: NodeOf<"table">): string | null {
  const firstRow = Array.isArray(node.value) ? node.value[0] : undefined;
  const cells = isNode(firstRow)
    ? (firstRow as { readonly parameterOne?: unknown }).parameterOne
    : undefined;
  const firstTd = Array.isArray(cells) ? cells[0] : undefined;
  const hash = isNode(firstTd)
    ? (firstTd as { readonly parameterTwo?: unknown }).parameterTwo
    : undefined;
  return columnAlignment(hash, node.kind);
}

/**
 * `Table::Array#to_latex` (`array.rb:15`): `\begin{array}` plus the column
 * descriptor from the first row (`array_args` — `|` for a pipe-leading td,
 * an alignment letter for a columnalign td, nothing otherwise; `.` when the
 * whole row yields nothing).
 */
function renderArrayTable(node: NodeOf<"table">, context: RenderContext): string {
  const firstRow = Array.isArray(node.value) ? node.value[0] : undefined;
  const cells = isNode(firstRow)
    ? (firstRow as { readonly parameterOne?: unknown }).parameterOne
    : undefined;
  if (!Array.isArray(cells)) {
    throw new RenderError(
      "table.value: array_args reads value.first.parameter_one — the gem raises NoMethodError here",
      FORMAT,
      node.kind,
    );
  }
  const args = cells.map((td) => {
    const tdCells = isNode(td)
      ? (td as { readonly parameterOne?: unknown }).parameterOne
      : undefined;
    if (!Array.isArray(tdCells)) {
      throw new RenderError(
        "table.value: array_args reads each td's parameter_one.first — the gem raises NoMethodError here",
        FORMAT,
        node.kind,
      );
    }
    if (tdCells.length > 0 && isPipeSymbol(tdCells[0])) return "|";
    return columnAlignment((td as { readonly parameterTwo?: unknown }).parameterTwo, node.kind);
  });
  const descriptor = args.every((entry) => entry === null)
    ? "."
    : `{${args.map((entry) => entry ?? "").join("")}}`;
  return `\\begin{array}${descriptor}${latexContent(node, context)}\\end{array}`;
}

/**
 * `Table#to_latex` (`table.rb:79`): `Paren::Norm` as open paren
 * short-circuits to `Vmatrix`; a NIL open paren takes the
 * `environment == "array"` branch (`MATRICES.invert[nil]` is `:array`) and
 * inserts the measured `{a…|…}` column descriptor; parens render through
 * `to_latex` with `\left`/`\right` prefixes spliced off and `.` standing in
 * for nil (or a nil RENDER — Ruby's `|| "."`).
 */
function renderGenericTable(node: NodeOf<"table">, context: RenderContext): string {
  const open = node.openParen;
  if (isNode(open) && open.kind === "symbol" && open.id === "Paren::Norm") {
    return `\\begin{Vmatrix}${latexContent(node, context)}\\end{Vmatrix}`;
  }
  let separator = "";
  if (open === null || open === undefined) {
    separator = `{${latexColumnDescriptor(node)}}`;
  }
  const openRender =
    open === null || open === undefined
      ? "."
      : (renderChild(open, context, "table.openParen") ?? ".");
  const closeRender =
    node.closeParen === null || node.closeParen === undefined
      ? "."
      : (renderChild(node.closeParen, context, "table.closeParen") ?? ".");
  const left = `\\left ${deletePrefix(openRender, "\\left")}\\begin{matrix}`;
  const right = `\\end{matrix}\\right ${deletePrefix(closeRender, "\\right")}`;
  return `${left}${separator}${latexContent(node, context)}${right}`;
}

/** `Table#latex_content`: nil-safe rows joined with ` \\ ` (`table.rb:253`). */
function latexContent(node: NodeOf<"table">, context: RenderContext): string {
  const value = node.value;
  if (value === null || value === undefined) return "";
  if (!Array.isArray(value)) {
    throw new RenderError(
      `table.value: is ${describeSlot(value)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      node.kind,
    );
  }
  return value
    .map((row) =>
      row === null || row === undefined ? "" : s(renderChild(row, context, "table.value")),
    )
    .join(" \\\\ ");
}

/**
 * `table_attribute(:latex)` over `column_lines` (`table.rb:215-240`),
 * measured: one flag per pipe-free td of the FIRST row (`"a"`), a pipe td
 * marking the previous column solid (`"|"`), and a leading `"a"` inserted
 * whenever any solid exists. A table with no first row, or a first row
 * without a cell list, crashes in the gem — RenderError here.
 */
function latexColumnDescriptor(node: NodeOf<"table">): string {
  const firstRow = Array.isArray(node.value) ? node.value[0] : undefined;
  const cells = isNode(firstRow)
    ? (firstRow as { readonly parameterOne?: unknown }).parameterOne
    : undefined;
  if (!Array.isArray(cells)) {
    throw new RenderError(
      "table.value: the column descriptor reads value.first.parameter_one — " +
        "the gem raises NoMethodError here (a paren-less table needs a first row)",
      FORMAT,
      node.kind,
    );
  }
  const columns: (string | null)[] = [];
  cells.forEach((td, index) => {
    const tdCells = isNode(td)
      ? (td as { readonly parameterOne?: unknown }).parameterOne
      : undefined;
    if (!Array.isArray(tdCells)) {
      throw new RenderError(
        "table.value: the column descriptor reads each td's parameter_one — " +
          "the gem raises NoMethodError here",
        FORMAT,
        node.kind,
      );
    }
    if (tdCells.some((cell) => isPipeSymbol(cell))) {
      if (columns.length === 0) {
        columns.push("solid");
      } else {
        // Ruby's `columns_array[i - 1] = "solid"` pads with nil when the
        // index runs past the end; keep the padding explicit so no JS array
        // hole changes the join.
        while (columns.length < index - 1) columns.push(null);
        columns[index - 1] = "solid";
      }
    } else {
      columns.push("none");
    }
  });
  if (columns.includes("solid")) columns.unshift("none");
  return columns.map((flag) => (flag === "solid" ? "|" : "a")).join("");
}

/** Ruby's `String#delete_prefix`, for the `\left`/`\right` paren splices. */
function deletePrefix(text: string, prefix: string): string {
  return text.startsWith(prefix) ? text.slice(prefix.length) : text;
}
