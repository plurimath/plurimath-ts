import { describeThrown } from "../../core/errors";
import { assertMathNodeShape, type MathNode, RenderError } from "../../core/index";
import { assertKnownOptions } from "../../core/render-options";
import { isStackOverflow } from "../../core/stack-overflow";
import { type FormatterOptions, resolveNumberFormat } from "../../formatting/index";
import type { UnitsmlRenderOptions } from "../../unitsml/index";
import { createRenderContext, ROOT_CONTEXT } from "./render";
import { FORMAT, isOwnMissingSymbolDataError } from "./render-shared";

/** Per-call number formatting and nested UnitsML conversion options. */
export interface HtmlOptions {
  readonly formatter?: FormatterOptions | null;
  readonly unitsml?: UnitsmlRenderOptions | null;
}

/** Unknown top-level option keys are refused before rendering. */
const ACCEPTED_OPTIONS: readonly string[] = ["formatter", "unitsml"];

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
export function toHtml(node: MathNode, options?: HtmlOptions | null): string {
  // The options come first, as they do in Ruby: the keyword check there is
  // part of the call, so an unknown keyword raises before the method body
  // ever looks at the receiver.
  assertKnownOptions(options, ACCEPTED_OPTIONS, FORMAT);
  assertMathNodeShape(node, FORMAT);
  const numberFormat = resolveNumberFormat(options?.formatter, FORMAT);
  const unitsml = options?.unitsml ?? null;
  const context =
    numberFormat === null && unitsml === null
      ? ROOT_CONTEXT
      : createRenderContext(numberFormat, unitsml);
  try {
    return context.render(node) ?? "";
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
    // `isStackOverflow` (pegkit/atom.ts), not a bare `instanceof RangeError`:
    // the class alone also matches `UndecodableEntityError` (core/nodes.ts),
    // an ordinary entity-decode refusal that is a `RangeError` subclass but
    // has nothing to do with recursion — see the asciimath/latex/unicodemath
    // renderers' matching comment for the measured case that found this.
    if (isStackOverflow(error)) {
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
