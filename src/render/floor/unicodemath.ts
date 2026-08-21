/**
 * Mirrors `function/floor.rb` — `Floor#to_unicodemath` (:33).
 *
 * The fences are emitted **only when the node carries no paren of its own**:
 * the gem writes `first_value = "&#x230a;" unless open_paren`, so a node that
 * already has an open paren contributes nothing here and the paren is rendered
 * by whatever holds it.
 *
 * `unless open_paren` is Ruby TRUTHINESS, and this file used to port it as a
 * nil-only test — which is wrong for `false`, the one value that separates the
 * two. `open_paren` is a plain boolean flag on `Floor` (`floor.rb:7`,
 * `attr_accessor :open_paren, :close_paren`) and the gem sets it to `false`
 * itself, in `line_breaking` (`floor.rb:48` and `:51`, `ceil_object.close_paren
 * = false` and `self.open_paren = false unless open_paren`), so the value is
 * reachable rather than hypothetical. Measured on the pinned oracle (0.11.6,
 * 00c52783), `Floor.new(Symbol("x"))` with both flags assigned directly:
 *
 *   open_paren = close_paren = nil    => "&#x230a;x&#x230b;"
 *   open_paren = close_paren = false  => "&#x230a;x&#x230b;"   (both fences KEPT)
 *   open_paren = close_paren = true   => "x"
 *
 * The nil-only test gave `"x"` for the `false` row, dropping both fences the
 * gem keeps. `present` is the exact test: false for nil and false, true for
 * everything else — including the empty string, which Ruby counts as truthy.
 *
 * The values are HTML entities rather than characters, exactly as the gem
 * emits them. `Formula#to_unicodemath` decodes at the boundary, and that
 * decode is idempotent, so passing them through undecoded is correct.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { present, renderOptionalChild } from "../../formats/unicodemath/render-shared";

/** U+230A LEFT FLOOR, and U+230B RIGHT FLOOR. */
const OPEN = "&#x230a;";
const CLOSE = "&#x230b;";

export function renderFloor(node: NodeOf<"floor">, context: RenderContext): string {
  const open = present(node.openParen) ? "" : OPEN;
  const close = present(node.closeParen) ? "" : CLOSE;
  const inner = renderOptionalChild(node.parameterOne, context);
  return `${open}${inner}${close}`;
}
