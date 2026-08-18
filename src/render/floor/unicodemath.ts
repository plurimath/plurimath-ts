/**
 * Mirrors `function/floor.rb` — `Floor#to_unicodemath` (:33).
 *
 * The fences are emitted **only when the node carries no paren of its own**:
 * the gem writes `first_value = "&#x230a;" unless open_paren`, so a node that
 * already has an open paren contributes nothing here and the paren is rendered
 * by whatever holds it.
 *
 * The values are HTML entities rather than characters, exactly as the gem
 * emits them. `Formula#to_unicodemath` decodes at the boundary, and that
 * decode is idempotent, so passing them through undecoded is correct.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { renderOptionalChild } from "../../formats/unicodemath/render-shared";

/** U+230A LEFT FLOOR, and U+230B RIGHT FLOOR. */
const OPEN = "&#x230a;";
const CLOSE = "&#x230b;";

export function renderFloor(node: NodeOf<"floor">, context: RenderContext): string {
  const open = node.openParen === undefined || node.openParen === null ? OPEN : "";
  const close = node.closeParen === undefined || node.closeParen === null ? CLOSE : "";
  const inner = renderOptionalChild(node.parameterOne, context);
  return `${open}${inner}${close}`;
}
