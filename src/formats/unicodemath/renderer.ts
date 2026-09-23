/**
 * The UnicodeMath renderer (ARCHITECTURE.md §4-5): a `MathNode` tree to
 * UnicodeMath text, byte-identical to the gem's `to_unicodemath`.
 *
 * Same shape as the LaTeX and AsciiMath renderers — a function per node kind
 * under `src/render/<kind>/unicodemath.ts`, joined by the total dispatch table
 * in `./render.ts` and recursing through `context.render` (§5) — with two
 * things this format has and the others do not.
 *
 * **The boundary pass is a node renderer, not this function.** The gem does
 * its entity decode and `" / "` squeeze inside `Formula#to_unicodemath`
 * (`formula.rb:187`), and a nested formula is reached through that same public
 * method (`unicodemath_value` maps `v.to_unicodemath(...)`, `:488`) — so the
 * pass runs once per nesting level, not once at the top. `Formula::Mrow`
 * inherits it too. `formulaBoundary` in `./render-shared.ts` is therefore
 * where it lives, and it is idempotent, which is what makes the repetition
 * harmless. Putting it here instead would decode a bare non-Formula node the
 * gem leaves encoded.
 *
 * **Parents interrogate their children.** `mini_sized?`, `prime_unicode?` and
 * `negated_value?` are questions a node asks of a child, and the answer
 * changes the *parent's* output — a join separator that appears or vanishes, a
 * sub/sup pair that swaps. Those predicates live in `./render-shared.ts` with
 * their measured tables, because a wrong answer is invisible on every shape
 * except the one it governs (`test/formats/unicodemath/render-shared.spec.ts`).
 *
 * The gem threads an `options:` hash through every `to_unicodemath`, which
 * looks like a context axis and mostly is not one: it is
 * `{formatter:, unitsml:, formula:}`, and on this path the only reader is
 * `Number#format_value_with_options` (`number.rb:115`) — B2's first slice
 * (`../../formatting/number-format.ts`). Separately, the generated exception
 * matrix (`src/generated/unicodemath/exceptions.ts`) is empty: no symbol's
 * unicodemath value varies on any probed axis, and
 * `test/generated/unicodemath-data.spec.ts` pins that emptiness so a
 * regeneration introducing variants fails loudly. The per-node `options` the
 * kind files read is unrelated — a parser-set field on the node.
 *
 * Every branch is measured, never transliterated (PORTING-STANDARDS.md):
 * behaviour was read off live gem instances against the pinned oracle
 * checkout (plurimath 0.11.6, 00c52783).
 *
 * Where the gem CRASHES this port raises `RenderError`, as on the other
 * formats — the gem wraps the same crash into `Math::ParseError` at its
 * formula boundary (`wrap_render_error(:unicodemath)`, `formula.rb:190`), and
 * crash → `RenderError` is the §5 runtime-boundary contract.
 */

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
 * symbols and numeric pipeline (precision, significant digits, digit count,
 * padding, number sign, notation, base, string format), resolved by
 * `resolveNumberFormat` (`../../formatting/number-format.ts`). The
 * gem's other two `to_unicodemath` keywords — `unitsml:`, `options:`
 * (formula.rb:187 on the pinned oracle) — are still not implemented at all.
 */
export interface UnicodemathOptions {
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
 * `Formula#to_unicodemath` / any node's `to_unicodemath`, as a module
 * function.
 *
 * Validates the tree's shape once at entry (`assertMathNodeShape`), so a
 * malformed tree fails as `RenderError` with the offending path, never as a
 * `TypeError` inside the dispatch.
 */
export function toUnicodemath(node: MathNode, options?: UnicodemathOptions | null): string {
  // The options come first, as they do in Ruby: the keyword check there is
  // part of the call, so an unknown keyword raises before the method body
  // ever looks at the receiver.
  assertKnownOptions(options, ACCEPTED_OPTIONS, FORMAT);
  // Structural check only — `assertMathNodeShape` deliberately returns
  // `void`, not `asserts node is MathNode` (see core/validate.ts).
  assertMathNodeShape(node, FORMAT);
  const numberFormat = resolveNumberFormat(options?.formatter, FORMAT);
  const context = numberFormat === null ? ROOT_CONTEXT : createRenderContext(numberFormat);
  try {
    // `?? ""`: the renders that return nil in Ruby map to "" at the public
    // string boundary, exactly as the latex and asciimath entries do. No
    // decode here — see this file's header; `renderFormula` already ran it,
    // and a bare non-Formula node is left encoded because the gem leaves it
    // encoded.
    return context.render(node) ?? "";
  } catch (error) {
    // Only this walk's own surfaces pass through: `RenderError` (the §5
    // contract) and the symbol table's `MissingSymbolDataError`, checked by
    // membership in the throw site's own instance set — never `instanceof`,
    // because the class is constructible by the input too and the dual
    // ESM/CJS build means two copies of it exist.
    if (error instanceof RenderError || isOwnMissingSymbolDataError(error)) throw error;
    // A render-phase stack exhaustion the validator's smaller frames
    // survived is genuine depth, branded with the validator's own too-deep
    // words rather than the generic mid-walk wrap.
    if (error instanceof RangeError) {
      throw new RenderError(
        "node: the tree nests too deep for the walk's call stack. The ceiling is " +
          "environment-dependent and lower than the gem's — the gem's own render " +
          "survives to roughly 4,500 frames on default stacks before " +
          "SystemStackError — so a tree in that window renders there and raises " +
          "here (TODO.plan/deferred.md)",
        FORMAT,
        "unknown",
      );
    }
    // Anything else — a property read that answered validation and then threw
    // (no Ruby ivar read runs code, a JS getter does) — becomes the
    // `RenderError` the §5 contract promises, original message kept via
    // `describeThrown`, which runs the thrown value's own `toString` behind a
    // fallback so a secondary throw cannot leak the raw value.
    throw new RenderError(
      `rendering failed mid-walk — ${describeThrown(error)}`,
      FORMAT,
      "unknown",
    );
  }
}
