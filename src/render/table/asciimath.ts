/**
 * Mirrors `function/table.rb` — `Table#to_asciimath` (:40) — and the carrier
 * name arms the census folds in: `table/matrix.rb` (:15, its own override)
 * and the `SIMPLE_TABLES` set routed through `parentheless_table`
 * (`table.rb:379-383`).
 *
 * Measured pin worth naming: a `Table` with a nil close paren falls back
 * through `Asciimath::Constants::TABLE_PARENTHESIS` and an unlisted open
 * paren yields the empty string: `{:[x]` for an `{:` open. `Matrix` maps its
 * rows strictly while `parentheless_table` is nil-safe.
 */

import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  type RenderContext,
  renderChild,
  s,
  unreachableName,
} from "../../formats/asciimath/render-shared";
import {
  ASCIIMATH_SIMPLE_TABLE_NAMES,
  ASCIIMATH_TABLE_CLOSE_FALLBACK,
} from "../../generated/asciimath/render-tables";

/**
 * `Asciimath::Constants::TABLE_PARENTHESIS` — the close paren a table falls
 * back to when it has none, keyed by the rendered open paren; a miss is the
 * empty string (measured: open `{` renders `{[x]`). Generated from the
 * constant the render path reads, each mapping verified by a render.
 */
const TABLE_CLOSE_FALLBACK: ReadonlyMap<string, string> = ASCIIMATH_TABLE_CLOSE_FALLBACK;

/**
 * `Table::SIMPLE_TABLES` (`table.rb:20`), generated, as a set for membership
 * tests; `Matrix`'s identical override is its own branch below.
 */
const PARENTHELESS_TABLE_NAMES: ReadonlySet<string> = new Set(ASCIIMATH_SIMPLE_TABLE_NAMES);

/**
 * The class names this carrier has measured behaviour for — every `Table`
 * subclass in the gem (probe-subclass-census.rb on the oracle, 2026-08-07:
 * exactly these 10, only `Matrix` overriding `to_asciimath`). The AsciiMath
 * transform builds only bare tables, so unlike the other carriers' sets this
 * one is not derivable from the transform registry; it is hand-listed, and
 * every entry is pinned by a behavioural render in
 * `test/formats/asciimath/renderer.spec.ts` ("renders every aliased table
 * subclass as the gem does") — dropping one from this set turns that pin
 * red. A defined name outside the set raises before base-table dispatch,
 * because rendering the carrier default for an unmeasured class would
 * diverge silently (`unreachableName` in
 * `../../formats/asciimath/render-shared.ts`).
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
  if (node.name !== undefined && !MEASURED_TABLE_NAMES.has(node.name))
    throw unreachableName(node.kind, node.name);
  const className = node.name === undefined ? "table" : node.name.toLowerCase();

  if (className === "matrix") {
    // `Matrix#to_asciimath` — strict rows, unlike `parentheless_table`.
    if (!Array.isArray(node.value)) {
      throw new RenderError(
        `table.value: is ${describeSlot(node.value)}, not a list — the gem raises NoMethodError here`,
        FORMAT,
        node.kind,
      );
    }
    const rows = node.value.map((row) => s(renderChild(row, context, "table.value"))).join(", ");
    return `{:${rows}:}`;
  }

  if (PARENTHELESS_TABLE_NAMES.has(className)) {
    // `parentheless_table` — nil-safe rows (`table.rb:379-383`).
    if (!Array.isArray(node.value)) {
      throw new RenderError(
        `table.value: is ${describeSlot(node.value)}, not a list — the gem raises NoMethodError here`,
        FORMAT,
        node.kind,
      );
    }
    const rows = node.value
      .map((row) =>
        row === null || row === undefined ? "" : s(renderChild(row, context, "table.value")),
      )
      .join(", ");
    return `{:${rows}:}`;
  }

  // `Table#to_asciimath` — `value&.map { |val| val&.to_asciimath }&.join(", ")`.
  let rows = "";
  if (node.value !== null && node.value !== undefined) {
    if (!Array.isArray(node.value)) {
      throw new RenderError(
        `table.value: is ${describeSlot(node.value)}, not a list — the gem raises NoMethodError here`,
        FORMAT,
        node.kind,
      );
    }
    rows = node.value
      .map((row) =>
        row === null || row === undefined ? "" : s(renderChild(row, context, "table.value")),
      )
      .join(", ");
  }
  const open =
    node.openParen === null || node.openParen === undefined
      ? "["
      : s(renderChild(node.openParen, context, "table.openParen"));
  const close =
    node.closeParen === null || node.closeParen === undefined
      ? (TABLE_CLOSE_FALLBACK.get(open) ?? "")
      : s(renderChild(node.closeParen, context, "table.closeParen"));
  return `${open}${rows}${close}`;
}
