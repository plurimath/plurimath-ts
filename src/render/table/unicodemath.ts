/**
 * Mirrors `function/table.rb` — `Table#to_unicodemath` (:104).
 *
 * Rows join on `@`; the wrapper depends on whether the table qualifies as a
 * UnicodeMath matrix class.
 *
 * **Two branches of `unicodemath_class_name` (`table.rb:415`) are dead in the
 * gem and are ported as dead:**
 *
 *   - `:416` calls `is_a?` on `open_paren&.class_name`, which is a String, so
 *     it is never a `Paren::Norm` and the branch cannot fire;
 *   - `:419` compares an instance to a Class object, which is never equal.
 *
 * Repairing either would change output the corpus has measured. They are left
 * unreachable, named here so the next reader does not "fix" them.
 *
 * `unicodemath_table_class?` is itself guarded by `class_name == "table"`, so
 * it is false for every Table subclass — which is why bmatrix, cases, eqarray,
 * matrix, pmatrix and vmatrix each override `to_unicodemath` rather than
 * sharing this path.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { fieldGlyph, isNode, renderOptionalChild } from "../../formats/unicodemath/render-shared";
import {
  UNICODEMATH_MATRIXS,
  UNICODEMATH_PARENTHESIS_MATRICES,
} from "../../generated/unicodemath/render-tables";

/** U+25A0 BLACK SQUARE — the generic matrix marker. */
const MATRIX_MARK = "■";

export function renderTable(node: NodeOf<"table">, context: RenderContext): string {
  const rows = (node.value ?? [])
    .map((row) => (isNode(row) ? (context.render(row) ?? "") : ""))
    .join("@");

  const className = matrixClassName(node, context);
  if (className !== null) return `${className}(${rows})`;

  const open = renderOptionalChild(node.openParen, context);
  const close = renderOptionalChild(node.closeParen, context);
  return `${open}${MATRIX_MARK}(${rows})${close}`;
}

/**
 * `unicodemath_table_class?` (`table.rb:406`) — a table with parens on both
 * sides, or whose open paren's partner is its close paren.
 */
function isMatrixClass(node: NodeOf<"table">): boolean {
  if (node.name !== "table") return false;

  const open = node.openParen;
  const close = node.closeParen;
  const hasOpen = open !== undefined && open !== null;
  const hasClose = close !== undefined && close !== null;
  if (!hasOpen && !hasClose) return false;

  return hasOpen && hasClose;
}

/** `unicodemath_class_name` (`table.rb:415`), with the two dead branches omitted. */
function matrixClassName(node: NodeOf<"table">, context: RenderContext): string | null {
  if (!isMatrixClass(node)) return null;

  const glyph = fieldGlyph(node.openParen, context);
  if (glyph === null) return null;

  for (const [name, paren] of UNICODEMATH_PARENTHESIS_MATRICES) {
    if (paren === glyph) return UNICODEMATH_MATRIXS.get(name) ?? null;
  }
  return null;
}
