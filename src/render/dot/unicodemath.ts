/**
 * Mirrors `function/dot.rb` — `Dot#to_unicodemath` (:47).
 *
 * Same shape as the other combining accents, with one difference kept from the
 * gem: `Dot` guards `parameter_one` before wrapping, so a missing child yields
 * the bare mark rather than `()` with the mark on it.
 *
 * That guard is load-bearing, and the comment here used to claim it was not —
 * that `Bar` and friends "reach the same output by a different route" because
 * `unicodemath_parens` returns nil for a nil field. It does not: its first line
 * is `paren = field.to_unicodemath(options: options)`, unguarded, and the
 * trailing `if field` only decides whether an already-rendered field gets
 * wrapped. Measured on the pinned oracle (0.11.6, 00c52783):
 *
 *   Dot.new(nil).to_unicodemath(options: {})    => "̇"
 *   Bar.new(nil).to_unicodemath(options: {})    !! NoMethodError: undefined
 *                                                  method 'to_unicodemath' for nil
 *   Hat.new(nil)  / Tilde.new(nil)              !! the same NoMethodError
 *
 * So the unguarded accents CRASH where `Dot` renders the bare mark, and
 * `./../bar/unicodemath.ts` is right to let `unicodemathParens` throw.
 *
 * The guard is `if parameter_one` — Ruby truthiness, not a nil test — so it is
 * `present`, not a `=== null` check. Measured: a `Dot` whose `parameter_one`
 * was assigned `false` also renders `"̇"`, where `&.` would have called
 * `to_unicodemath` on `false` and raised.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { present, unicodemathParens } from "../../formats/unicodemath/render-shared";

/** U+0307 COMBINING DOT ABOVE. */
const MARK = "̇";

export function renderDot(node: NodeOf<"dot">, context: RenderContext): string {
  const value = !present(node.parameterOne)
    ? ""
    : (unicodemathParens(node.parameterOne, context) ?? "");
  return `${value}${MARK}`;
}
