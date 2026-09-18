import { describeThrown } from "../../core/errors";
import { assertMathNodeShape, type MathNode, RenderError } from "../../core/index";
import { assertKnownOptions } from "../../core/render-options";
import { type FormatterOptions, resolveNumberFormat } from "../../formatting/index";
import { createRenderContext, ROOT_CONTEXT } from "./render";
import { FORMAT, isOwnMissingSymbolDataError } from "./render-shared";

/**
 * Renderer options, typed exactly (§5). `formatter` is B2's first slice
 * (TODO.plan/feature-roadmap.md, "Number formatting"; TODO.plan/
 * open-decisions.md, "Number-formatter API shape") — `Formatter::Standard`'s
 * default-symbol behavior only, resolved by `resolveNumberFormat`
 * (`../../formatting/number-format.ts`), which itself refuses by name every
 * field of the gem's `formatter:` keyword this slice does not implement. The
 * gem's other two `to_html` keywords — `unitsml:`, `options:` (formula.rb:149
 * on the pinned oracle) — are still not implemented at all.
 */
export interface HtmlOptions {
  readonly formatter?: FormatterOptions | null;
}

/**
 * The option keys this entry accepts. `formatter` is implemented (above);
 * every other key — including the gem's own `unitsml:` and `options:`
 * keywords — is unknown and refused BY NAME (`assertKnownOptions`,
 * core/render-options.ts) instead of ignored.
 */
const ACCEPTED_OPTIONS: readonly string[] = ["formatter"];

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
  const context = numberFormat === null ? ROOT_CONTEXT : createRenderContext(numberFormat);
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
