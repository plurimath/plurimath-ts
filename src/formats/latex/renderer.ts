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
import { ROOT_CONTEXT } from "./render";
import { FORMAT, isOwnMissingSymbolDataError } from "./render-shared";

/**
 * Renderer options. Empty today and typed exactly (§5): the gem's only
 * observable option on this path is a configured number formatter, which is
 * P4 scope — with none configured a number renders its raw value, and the
 * whole pinned corpus was generated that way. `toLatex` never READS the
 * parameter (no latex render consults an option — the exception matrix is
 * empty), so there is no options-shape guard here: a guard on an unread
 * argument would be dead code pretending at a contract.
 */
export type LatexOptions = Record<string, never>;

/**
 * `Formula#to_latex` / any node's `to_latex`, as a module function.
 *
 * Validates the tree's shape once at entry (`assertMathNodeShape`), so a
 * malformed tree fails as `RenderError` with the offending path, never as a
 * `TypeError` inside the dispatch.
 */
export function toLatex(node: MathNode, _options?: LatexOptions | null): string {
  // Structural check only — `assertMathNodeShape` deliberately returns
  // `void`, not `asserts node is MathNode` (missing constructed fields and
  // boolean/number slots pass; narrowing would overpromise, see
  // core/validate.ts). The compile-time contract stays on this parameter's
  // declared type; a JS caller's unvalidated value either fails this check
  // or the per-site guards behind it, as `RenderError`.
  assertMathNodeShape(node, FORMAT);
  try {
    // `?? ""`: the renders that return nil in Ruby (a bare `FontStyle` or
    // `Mpadded` with a nil value, a base symbol with no value) map to "" at
    // the public string boundary, exactly as the asciimath entry does.
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
    // The gem's boundary does the analogous split: `wrap_render_error`
    // (`formula.rb:437`) re-raises its ParseError and wraps every other
    // StandardError into one — and the gem's render-phase ParseError maps to
    // RenderError here, so the port's ParseError is never this walk's error.
    if (error instanceof RenderError || isOwnMissingSymbolDataError(error)) throw error;
    // A render-phase stack exhaustion the validator's smaller frames
    // survived is genuine depth, branded with the validator's own too-deep
    // words (`core/validate.ts` — the parity window they describe is
    // TODO.plan/deferred.md's), never the generic mid-walk wrap. One honest
    // limit the validator does not share: its reads are wrapped at the read
    // site, so a RangeError at ITS entry can only be the walk's own — the
    // render walk's reads are bare, so a getter that answered validation and
    // then threw a deliberate RangeError mid-render takes this branding too.
    // No Ruby ivar read runs code, so the shape has no gem behaviour to
    // diverge from, and both spellings keep the RenderError contract.
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
