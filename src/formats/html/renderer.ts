import { describeThrown } from "../../core/errors";
import { assertMathNodeShape, type MathNode, RenderError } from "../../core/index";
import { ROOT_CONTEXT } from "./render";
import { FORMAT, isOwnMissingSymbolDataError } from "./render-shared";

/**
 * Renderer options. Empty today and typed exactly (§5), for the same reason as
 * `LatexOptions`: the gem's `to_html` takes `formatter:`, `unitsml:` and
 * `options:`, and the only one observable on this path is a configured number
 * formatter, which is P4 scope. `toHtml` never READS the parameter, so there is
 * no options-shape guard — a guard on an unread argument would be dead code
 * pretending at a contract.
 */
export type HtmlOptions = Record<string, never>;

/**
 * `Formula#to_html` / any node's `to_html`, as a module function.
 *
 * Validates the tree's shape once at entry (`assertMathNodeShape`), so a
 * malformed tree fails as `RenderError` with the offending path, never as a
 * `TypeError` inside the dispatch.
 *
 * Coverage is partial: kinds whose output needs data this slice does not carry
 * raise `RenderError` naming what is missing rather than emitting approximate
 * markup. `test/formats/html/parity-target.ts` pins exactly which pinned corpus
 * cases render and which refuse.
 */
export function toHtml(node: MathNode, _options?: HtmlOptions | null): string {
  assertMathNodeShape(node, FORMAT);
  try {
    return ROOT_CONTEXT.render(node) ?? "";
  } catch (error) {
    // Only this walk's own surfaces pass through: `RenderError` (the §5
    // contract) and the symbol table's `MissingSymbolDataError` — the one
    // non-RenderError PlurimathError a kind file throws on purpose
    // (`renderSymbol`, on an id the generated table does not carry), and a
    // public error code in its own right. That second pass-through checks
    // membership in the throw site's own instance set
    // (`isOwnMissingSymbolDataError`, render-shared.ts), never `instanceof`:
    // the class is constructible by the input too, and a hostile getter
    // throwing one mid-render is an input failure, not a symbol-table miss.
    if (error instanceof RenderError || isOwnMissingSymbolDataError(error)) throw error;
    if (error instanceof RangeError) {
      throw new RenderError(
        "node: the tree nests too deep for the HTML walk's call stack",
        FORMAT,
        "unknown",
      );
    }
    throw new RenderError(
      `HTML rendering failed mid-walk — ${describeThrown(error)}`,
      FORMAT,
      "unknown",
    );
  }
}
