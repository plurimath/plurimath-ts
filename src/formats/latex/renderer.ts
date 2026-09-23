/**
 * The LaTeX renderer (ARCHITECTURE.md §4-5): a `MathNode` tree to LaTeX
 * text, byte-identical to the gem's `to_latex`.
 *
 * In Ruby, rendering is a method per node class. Here it is a function per
 * node kind — one directory per kind under `src/render`, this format's file
 * inside each (`../../render/<kind>/latex.ts`), mirroring the gem's
 * one-file-per-class layout, joined by the dispatch table in
 * `./render.ts` (typed total over `NodeKind`) and recursing through
 * `context.render` (§5, "How this maps to the gem"). Each kind file's header
 * names the gem file it mirrors and carries that class's measured pins; the
 * cross-cutting Ruby idioms live in `./render-shared.ts`. The carrier kinds the
 * census folds many gem classes into keep their class-name dispatch inside
 * their own kind file, because classes with their
 * *own* `to_latex` overrides render differently from their carrier default —
 * `Log` goes through `latex_wrapped` where `Lim` interpolates plainly.
 *
 * LaTeX rendering has NO context axis: the generated exception matrix
 * (`src/generated/latex/exceptions.ts`) is empty — no symbol varies on any
 * manifested axis — so unlike the asciimath renderer the context carries
 * only the dispatcher. `test/formats/latex/renderer.spec.ts` pins that
 * emptiness so a regeneration that introduces variants fails loudly.
 *
 * Every branch is measured, never transliterated (PORTING-STANDARDS.md): the
 * behaviour was read off live gem instances — one probe per shape, nil
 * combinations included — against the pinned oracle checkout (plurimath
 * 0.11.6, 00c52783).
 *
 * Where the gem CRASHES — a bare string in a formula's value (which its own
 * parse of `left(right)` or even `""` produces), `Power` with no first
 * parameter, `Text` holding a node, `Td`/`Tr` with a nil cell list, a table
 * under the column-descriptor path with no first row — this port raises
 * `RenderError`. The gem wraps the same crash into `Math::ParseError` at its
 * formula boundary; the mapping crash → `RenderError` is the §5
 * runtime-boundary contract.
 */

import { describeThrown } from "../../core/errors";
import { assertMathNodeShape, type MathNode, RenderError } from "../../core/index";
import { assertKnownOptions } from "../../core/render-options";
import { type FormatterOptions, resolveNumberFormat } from "../../formatting/index";
import { isStackOverflow } from "../../pegkit/index";
import { createRenderContext, ROOT_CONTEXT } from "./render";
import { FORMAT, isOwnMissingSymbolDataError } from "./render-shared";

/**
 * Renderer options, typed exactly (§5). `formatter` is B2's first slice
 * (TODO.plan/feature-roadmap.md, "Number formatting"; TODO.plan/
 * open-decisions.md, "Number-formatter API shape") — `Formatter::Standard`'s
 * symbols and numeric pipeline (precision, significant digits, digit count,
 * padding, number sign), resolved by `resolveNumberFormat`
 * (`../../formatting/number-format.ts`), which itself refuses by name every
 * field of the gem's `formatter:` keyword not yet implemented
 * (notation, base, string format). The gem's other
 * two `to_latex` keywords — `unitsml:`, `options:` (formula.rb:141 on the
 * pinned oracle) — are still not implemented at all.
 */
export interface LatexOptions {
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
 * `Formula#to_latex` / any node's `to_latex`, as a module function.
 *
 * Validates the tree's shape once at entry (`assertMathNodeShape`), so a
 * malformed tree fails as `RenderError` with the offending path, never as a
 * `TypeError` inside the dispatch.
 */
export function toLatex(node: MathNode, options?: LatexOptions | null): string {
  // The options come first, as they do in Ruby: the keyword check there is
  // part of the call, so an unknown keyword raises before the method body
  // ever looks at the receiver.
  assertKnownOptions(options, ACCEPTED_OPTIONS, FORMAT);
  // Structural check only — `assertMathNodeShape` deliberately returns
  // `void`, not `asserts node is MathNode` (missing constructed fields and
  // boolean/number slots pass; narrowing would overpromise, see
  // core/validate.ts). The compile-time contract stays on this parameter's
  // declared type; a JS caller's unvalidated value either fails this check
  // or the per-site guards behind it, as `RenderError`.
  assertMathNodeShape(node, FORMAT);
  const numberFormat = resolveNumberFormat(options?.formatter, FORMAT);
  const context = numberFormat === null ? ROOT_CONTEXT : createRenderContext(numberFormat);
  try {
    // `?? ""`: the renders that return nil in Ruby (a bare `FontStyle` or
    // `Mpadded` with a nil value, a base symbol with no value) map to "" at
    // the public string boundary, exactly as the asciimath entry does.
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
    // The gem's boundary does the analogous split: `wrap_render_error`
    // (`formula.rb:437`) re-raises its ParseError and wraps every other
    // StandardError into one — and the gem's render-phase ParseError maps to
    // RenderError here, so the port's ParseError is never this walk's error.
    if (error instanceof RenderError || isOwnMissingSymbolDataError(error)) throw error;
    // A render-phase stack exhaustion the validator's smaller frames
    // survived is genuine depth, branded with the validator's own too-deep
    // words (`core/validate.ts` — the parity window they describe is
    // TODO.plan/deferred.md's), never the generic mid-walk wrap. `isStackOverflow`
    // (pegkit/atom.ts) is the parser's own guard against the same ambiguity,
    // reused rather than re-heuristicized: a bare `instanceof RangeError` here
    // would also catch `UndecodableEntityError` (core/nodes.ts, itself a
    // `RangeError` subclass) surfacing from an ordinary entity-decode refusal
    // mid-render — a real but unrelated failure that this branding must not
    // swallow. `isStackOverflow` reads the engine's own wording instead of the
    // class alone, so only a genuine recursion failure takes this message.
    if (isStackOverflow(error)) {
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
    // Anything else — a property read that answered validation and then
    // threw (no Ruby ivar read runs code, a JS getter does — a re-thrown
    // port ParseError or an unrecorded MissingSymbolDataError included) —
    // becomes the RenderError the §5 contract promises, original message
    // kept; describing it runs the thrown value's own `toString`, so the
    // description falls back to a fixed phrase rather than let a secondary
    // throw leak the raw value (`describeThrown`).
    throw new RenderError(
      `rendering failed mid-walk — ${describeThrown(error)}`,
      FORMAT,
      "unknown",
    );
  }
}
