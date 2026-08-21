/**
 * Mirrors `function/ceil.rb` — `Ceil#to_unicodemath` (:36).
 *
 * The fences are emitted **only when the node carries no paren of its own**:
 * the gem writes `first_value = "&#x2308;" unless open_paren`, so a node that
 * already has an open paren contributes nothing here and the paren is rendered
 * by whatever holds it.
 *
 * `unless open_paren` is Ruby TRUTHINESS, and this file used to port it as a
 * nil-only test — which is wrong for `false`, the one value that separates the
 * two. `open_paren` is a plain boolean flag on `Ceil` (`ceil.rb:7`,
 * `attr_accessor :open_paren, :close_paren`) and the gem sets it to `false`
 * itself, in `line_breaking` (`ceil.rb:51` and `:54`, `ceil_object.close_paren
 * = false` and `self.open_paren = false unless open_paren`), so the value is
 * reachable rather than hypothetical. Measured on the pinned oracle (0.11.6,
 * 00c52783), `Ceil.new(Symbol("x"))` with the flags assigned directly:
 *
 *   open_paren nil,   close_paren nil    => "&#x2308;x&#x2309;"
 *   open_paren false, close_paren false  => "&#x2308;x&#x2309;"   (both fences KEPT)
 *   open_paren true,  close_paren nil    => "x&#x2309;"
 *   open_paren true,  close_paren true   => "x"
 *
 * The nil-only test dropped the opening fence for `false` and gave
 * `"x&#x2309;"` where the gem gives `"&#x2308;x&#x2309;"`. `present` is the
 * exact test: it is false for nil and false and true for everything else,
 * including the empty string, which Ruby counts as truthy — measured,
 * `open_paren = ""` drops the fence (`"x&#x2309;"`), as does a `Paren::Lround`
 * node in the same slot.
 *
 * The values are HTML entities rather than characters, exactly as the gem
 * emits them. `Formula#to_unicodemath` decodes at the boundary, and that
 * decode is idempotent, so passing them through undecoded is correct.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { present, renderOptionalChild } from "../../formats/unicodemath/render-shared";

/** U+2308 LEFT CEILING, and U+2309 RIGHT CEILING. */
const OPEN = "&#x2308;";
const CLOSE = "&#x2309;";

export function renderCeil(node: NodeOf<"ceil">, context: RenderContext): string {
  const open = present(node.openParen) ? "" : OPEN;
  const close = present(node.closeParen) ? "" : CLOSE;
  const inner = renderOptionalChild(node.parameterOne, context);
  return `${open}${inner}${close}`;
}
