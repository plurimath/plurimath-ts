/**
 * Mirrors `function/table.rb` — `Table#to_mathml_without_math_tag` (:52),
 * `#table_attribute`/`#column_lines`/`#mathml_attrs` (:215-251),
 * `#mathml_parenthesis` (:202), `#mathml_paren_present?` (:430),
 * `#norm_table` (:332) — and the carrier name arms the census folds in:
 * `table/matrix.rb` (:26, its own body with the gem's UNDEFINED
 * `validate_paren` — a live crash site), `table/array.rb` (:19, never
 * fenced), `table/bmatrix.rb` (always fenced), with `Vmatrix`, `Pmatrix`,
 * `Eqarray` and `Cases` measured byte-identical to the base at intent:
 * false (generated `MATHML_TABLE_NAME_FAMILIES`).
 *
 * The base pipeline, measured (probe-mathml-kinds / edges / edges3):
 *
 *   1. `column_lines` walks the FIRST row's cells — `value.first
 *      .parameter_one` raises on an empty/nil value or a non-`Td` cell
 *      (probes table-empty-value / tr-non-td-first / tr-nil-cell) — marking
 *      a `Vert`-holding cell `"solid"`; any `"solid"` becomes a
 *      `columnlines` attribute;
 *   2. a `Paren::CloseParen` close adds `columnalign="left"`;
 *   3. options ride onto `<mtable>` minus `:asterisk`; `options` nil with
 *      neither attribute renders bare (`args` stays nil), but CRASHES the
 *      gem when an attribute must be written (`nil[:columnlines]=`);
 *   4. a `Paren::Norm` OPEN routes `norm_table` — `<mo>&#x2016;</mo>`
 *      fences whatever the close is (probe table-norm-paren);
 *   5. `mathml_paren_present?` on either paren wraps `<mrow>` with
 *      `<mo>text</mo>` fences from the generated per-id paren table; a
 *      paren whose gem readers are missing crashes (probe table-lbbrack).
 */

import type { NodeParameter } from "../../core/index";
import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  hashOrNil,
  type MathmlRendered,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  setAttributesFromHash,
  slotKind,
  unreachableName,
} from "../../formats/mathml/render-shared";
import {
  MATHML_PAREN_ROLE_IDS,
  MATHML_TABLE_NAME_FAMILIES,
  MATHML_TABLE_PARENS,
} from "../../generated/mathml/render-tables";
import { XmlElement } from "../../xml/index";
import { isVertOnly } from "../binary-function/mathml";

const CLOSE_PAREN_IDS: ReadonlySet<string> = new Set(MATHML_PAREN_ROLE_IDS.close);
const NORM_PAREN_IDS: ReadonlySet<string> = new Set(MATHML_PAREN_ROLE_IDS.norm);

export function renderTable(node: NodeOf<"table">, context: RenderContext): MathmlRendered {
  const family = node.name === undefined ? "base" : MATHML_TABLE_NAME_FAMILIES.get(node.name);
  if (family === undefined) throw unreachableName(node.kind, String(node.name));

  switch (family) {
    case "matrix":
      return renderMatrix(node, context);
    case "array":
      // `Array#to_mathml_without_math_tag`: the mtable alone — `attributes(intent)`
      // is `table_attribute` at intent: false — never fenced (probe array).
      return mtableWithAttributes(node, context);
    case "bmatrix": {
      // `Bmatrix`: ALWAYS `<mrow>` fenced, even around empty paren texts.
      const mtable = mtableWithAttributes(node, context);
      return new XmlElement("mrow").append(
        new XmlElement("mo").append(parenText(node, node.openParen, "table.openParen")),
        mtable,
        new XmlElement("mo").append(parenText(node, node.closeParen, "table.closeParen")),
      );
    }
    default:
      return renderBaseTable(node, context);
  }
}

function renderBaseTable(node: NodeOf<"table">, context: RenderContext): MathmlRendered {
  const mtable = mtableWithAttributes(node, context);

  const openId = parenId(node.openParen);
  if (openId !== undefined && NORM_PAREN_IDS.has(openId)) {
    // `norm_table` (`table.rb:332-341`).
    return new XmlElement("mrow").append(
      new XmlElement("mo").append("&#x2016;"),
      mtable,
      new XmlElement("mo").append("&#x2016;"),
    );
  }

  if (
    parenPresent(node, node.openParen, "table.openParen") ||
    parenPresent(node, node.closeParen, "table.closeParen")
  ) {
    return new XmlElement("mrow").append(
      new XmlElement("mo").append(parenText(node, node.openParen, "table.openParen")),
      mtable,
      new XmlElement("mo").append(parenText(node, node.closeParen, "table.closeParen")),
    );
  }

  return mtable;
}

/**
 * `Matrix#to_mathml_without_math_tag` (`table/matrix.rb:26-39`): the mtable
 * alone when the parens are lround/rround or either is missing
 * (`table_tag_only?`); otherwise `mo_tag(paren)` calls the UNDEFINED
 * `validate_paren` and the gem crashes (probe matrix-square-parens).
 */
function renderMatrix(node: NodeOf<"table">, context: RenderContext): XmlElement {
  const mtable = mtableWithAttributes(node, context);
  const tableOnly =
    (classNameLike(node.openParen) === "lround" && classNameLike(node.closeParen) === "rround") ||
    !(present(node.openParen) && present(node.closeParen));
  if (tableOnly) return mtable;
  throw new RenderError(
    "table(Matrix): fencing parens reach mo_tag, whose validate_paren is UNDEFINED " +
      "in the gem — NoMethodError there (probe matrix-square-parens)",
    FORMAT,
    node.kind,
  );
}

/** `open_paren&.class_name` for Matrix's lround/rround test. */
function classNameLike(value: NodeParameter | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (slotKind(value) !== "symbol") return undefined;
  const id = (value as { readonly id?: unknown }).id;
  if (typeof id !== "string") return "symbol";
  const basename = id.slice(id.lastIndexOf(":") + 1);
  return basename.toLowerCase();
}

/** `<mtable>` with `table_attribute` and the rendered rows. */
function mtableWithAttributes(node: NodeOf<"table">, context: RenderContext): XmlElement {
  const mtable = new XmlElement("mtable");
  applyTableAttributes(mtable, node);
  const rows = node.value;
  if (rows !== null && rows !== undefined) {
    if (!Array.isArray(rows)) {
      throw new RenderError(
        `table.value: is ${describeSlot(rows)}, not a list — the gem raises NoMethodError here`,
        FORMAT,
        node.kind,
      );
    }
    for (const row of rows) {
      if (row === null || row === undefined) continue; // `object&.` per row
      mtable.append(renderChild(row, context, "table.value"));
    }
  }
  return mtable;
}

/**
 * `table_attribute(:mathml)` → `mathml_attrs(column_lines)`. The gem runs
 * this BEFORE anything renders, so its crashes precede the rows'.
 */
function applyTableAttributes(mtable: XmlElement, node: NodeOf<"table">): void {
  const columns = columnLines(node);
  const needsLines = columns.includes("solid");
  const needsAlign = closeParenIsCloseParen(node.closeParen);
  const options = hashOrNil(node.options, node.kind, "table.options");
  const args: Record<string, unknown> = {};
  if (options !== null) {
    for (const [key, value] of Object.entries(options)) {
      if (key !== "asterisk") args[key] = value;
    }
  } else if (needsLines || needsAlign) {
    // `args = options&.dup&.reject...` left nil, then `args[:columnlines] =`
    // — NoMethodError in the gem.
    throw new RenderError(
      "table.options: is nil while a columnlines/columnalign attribute must be " +
        "written — the gem raises NoMethodError here",
      FORMAT,
      node.kind,
    );
  }
  if (needsLines) args.columnlines = columns.join(" ");
  if (needsAlign) args.columnalign = "left";
  if (options === null && !needsLines && !needsAlign) return; // attributes: nil
  setAttributesFromHash(mtable, args, node.kind, "table.options");
}

/**
 * `column_lines` (`table.rb:226-241`): the FIRST row's cells scanned for a
 * `Vert` (or any `"|"`-valued symbol) — `value.first.parameter_one` and each
 * cell's `parameter_one` raise in the gem when missing.
 */
function columnLines(node: NodeOf<"table">): string[] {
  const rows = node.value;
  const firstRow = Array.isArray(rows) ? rows[0] : undefined;
  const cells =
    firstRow === null || firstRow === undefined
      ? undefined
      : (firstRow as { readonly parameterOne?: unknown }).parameterOne;
  if (!Array.isArray(cells)) {
    throw new RenderError(
      `table.value[0].parameter_one: is ${describeSlot(cells)}, not a cell list — ` +
        "column_lines raises NoMethodError in the gem (probes table-empty-value, " +
        "tr-non-td-first)",
      FORMAT,
      node.kind,
    );
  }
  const columns: string[] = [];
  cells.forEach((cell, index) => {
    const cellValue =
      cell === null || cell === undefined
        ? undefined
        : (cell as { readonly parameterOne?: unknown }).parameterOne;
    if (!Array.isArray(cellValue)) {
      throw new RenderError(
        `table.value[0].parameter_one[${index}]: has no cell value list — ` +
          "column_lines raises NoMethodError in the gem (probe tr-nil-cell)",
        FORMAT,
        node.kind,
      );
    }
    if (cellValue.some((entry) => isVertOnly(entry))) {
      if (columns.length === 0) {
        columns.push("solid");
      } else {
        columns[index - 1] = "solid";
      }
    } else {
      columns.push("none");
    }
  });
  return columns;
}

function closeParenIsCloseParen(closeParen: NodeParameter | undefined): boolean {
  const id = parenId(closeParen);
  return id !== undefined && CLOSE_PAREN_IDS.has(id);
}

function parenId(value: NodeParameter | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (slotKind(value) !== "symbol") return undefined;
  const id = (value as { readonly id?: unknown }).id;
  return typeof id === "string" ? id : undefined;
}

/**
 * `mathml_paren_present?` (`table.rb:430-435`): nil is absent; a GENERIC
 * symbol renders and counts unless its first text is the empty string —
 * `"{:"`/`":}"`/nil values render an empty `<mi/>` whose missing text READS
 * as present (`!nil` — probe table-symbol-empty-paren wraps with empty
 * `<mo></mo>` fences); a `Paren::*` id answers from the generated table.
 */
function parenPresent(
  node: NodeOf<"table">,
  field: NodeParameter | undefined,
  at: string,
): boolean {
  if (field === null || field === undefined) return false;
  if ((field as unknown) === false) return false; // `return false unless paren || ...`
  const kind = slotKind(field);
  if (kind !== "symbol") {
    // `paren&.to_mathml_without_math_tag(...)` then `.nodes.first.empty?` —
    // a non-symbol node reaches mathml_parenthesis next and crashes there;
    // surface the same refusal once, here.
    throw new RenderError(
      `${at}: holds ${describeSlot(field)} — the gem's paren pipeline raises ` +
        "NoMethodError on it (probe table-times-paren)",
      FORMAT,
      node.kind,
    );
  }
  const id = parenId(field);
  if (id === undefined || id === "Symbol" || id === "Paren") {
    const value = (field as { readonly value?: unknown }).value;
    if (value === null || value === undefined) return true; // empty <mi/>, no text: !nil
    if (typeof value !== "string") {
      throw new RenderError(
        `${at}: symbol value holds ${describeSlot(value)} — the gem raises on it`,
        FORMAT,
        node.kind,
      );
    }
    if (value === "{:" || value === ":}") return true; // empty <mi/>: !nil
    return value !== ""; // `!"".empty?` is false, everything else true
  }
  if (id.startsWith("Paren::")) {
    const entry = MATHML_TABLE_PARENS.get(id);
    if (entry !== undefined) return entry.present;
  }
  // A non-Paren id symbol: present iff its render has a non-empty first
  // text — every generated descriptor has one — but the TEXT lookup that
  // follows crashes the gem (no encoded/paren_value), so refuse here.
  throw new RenderError(
    `${at}: symbol "${id}" is not a Paren — mathml_parenthesis sends encoded/` +
      "paren_value to it and the gem raises NoMethodError (probe table-times-paren)",
    FORMAT,
    node.kind,
  );
}

/**
 * `mathml_parenthesis` (`table.rb:202-213`): a nil field is `""`; a generic
 * symbol contributes its rendered text (`nodes.first.to_s` — nil text reads
 * `""`); a `Paren::*` id its generated `encoded`/`paren_value` answer —
 * null marks the measured CRASH set (both readers missing or private,
 * probe table-lbbrack).
 */
function parenText(node: NodeOf<"table">, field: NodeParameter | undefined, at: string): string {
  if (field === null || field === undefined || (field as unknown) === false) return "";
  const kind = slotKind(field);
  if (kind !== "symbol") {
    throw new RenderError(
      `${at}: holds ${describeSlot(field)} — mathml_parenthesis raises on it`,
      FORMAT,
      node.kind,
    );
  }
  const id = parenId(field);
  if (id === undefined || id === "Symbol" || id === "Paren") {
    const value = (field as { readonly value?: unknown }).value;
    if (value === null || value === undefined) return "";
    if (typeof value !== "string") {
      throw new RenderError(
        `${at}: symbol value holds ${describeSlot(value)} — the gem raises on it`,
        FORMAT,
        node.kind,
      );
    }
    if (value === "{:" || value === ":}") return ""; // empty <mi/>: nil.to_s
    return INVISIBLE_PARENS.has(value) ? "" : value;
  }
  if (id.startsWith("Paren::")) {
    const entry = MATHML_TABLE_PARENS.get(id);
    if (entry !== undefined) {
      if (entry.text === null) {
        throw new RenderError(
          `${at}: Paren "${id}" answers neither encoded nor paren_value — ` +
            "NoMethodError in the gem (probe table-lbbrack)",
          FORMAT,
          node.kind,
        );
      }
      return entry.text;
    }
  }
  throw new RenderError(
    `${at}: symbol "${id}" has no measured paren text — the gem raises NoMethodError here`,
    FORMAT,
    node.kind,
  );
}

/** `invisible_paren?` (`table.rb:398-400`). */
const INVISIBLE_PARENS: ReadonlySet<string> = new Set([
  "&#x3016;",
  "&#x3017;",
  "&#x2524;",
  "&#x251c;",
]);
