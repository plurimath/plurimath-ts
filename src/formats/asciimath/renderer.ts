/**
 * The AsciiMath renderer (ARCHITECTURE.md §4-5): a `MathNode` tree back to
 * AsciiMath text, byte-identical to the gem's `to_asciimath`.
 *
 * In Ruby, rendering is a method per node class. Here it is a function per
 * node kind — one file each under `./render/`, mirroring the gem's
 * one-file-per-class layout, joined by the dispatch table in
 * `./render/index.ts` (typed total over `NodeKind`) and recursing through
 * `context.render` (§5, "How this maps to the gem"). Each kind file's header
 * names the gem file it mirrors and carries that class's measured pins; the
 * cross-cutting Ruby idioms live in `./render/shared.ts`. The five carrier
 * kinds the census folds many gem classes into (`unaryFunction`,
 * `binaryFunction`, `ternaryFunction`, `table`, `fontStyle`) keep their
 * class-name dispatch inside their own kind file, because classes with their
 * *own* `to_asciimath` overrides render differently from their carrier
 * default — `Lcm` renders `lcm x` where the default would render `lcmx`.
 *
 * Every branch is measured, never transliterated (PORTING-STANDARDS.md): the
 * behaviour was read off live gem instances — one probe per shape, nil
 * combinations included — against the pinned oracle checkout (plurimath
 * 0.11.6, 00c52783).
 *
 * Where the gem CRASHES — a bare string in a formula's value (which its own
 * parse of `left(right)` or even `""` produces), `Power` with no first
 * parameter, `Text` holding a node, `Fenced`'s second slot not a list — this
 * port raises `RenderError`. The gem wraps the same crash into
 * `Math::ParseError` at its formula boundary; the mapping crash →
 * `RenderError` is the §5 runtime-boundary contract.
 */

import { assertMathNodeShape, type MathNode } from "../../core/index";
import { ROOT_CONTEXT } from "./render/index";
import { FORMAT } from "./render/shared";

/**
 * Renderer options. Empty today and typed exactly (§5): the gem's only
 * observable option on this path is a configured number formatter, which is
 * P4 scope — with none configured a number renders its raw value, and the
 * whole pinned corpus was generated that way.
 */
export type AsciimathOptions = Record<string, never>;

/**
 * `Formula#to_asciimath` / any node's `to_asciimath`, as a module function.
 *
 * Validates the tree's shape once at entry (`assertMathNodeShape`), so a
 * malformed tree fails as `RenderError` with the offending path, never as a
 * `TypeError` inside the dispatch.
 */
export function toAsciimath(node: MathNode, _options?: AsciimathOptions | null): string {
  assertMathNodeShape(node, FORMAT);
  // `?? ""`: the one Ruby render that returns nil rather than a string is a
  // bare `FontStyle` with a nil value; a public string signature maps that to
  // "" (recorded in TODO.plan/deferred.md).
  return ROOT_CONTEXT.render(node) ?? "";
}
