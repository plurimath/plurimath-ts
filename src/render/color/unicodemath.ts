/**
 * Mirrors `function/color.rb` — `Color#to_unicodemath` (:65).
 *
 * The operator depends on the node's own options: `☁` for a background colour,
 * `✎` otherwise (`color.rb:71`). Neither parameter is guarded in the gem, so a
 * missing one raises there; here a null render becomes the empty string, which
 * is the port's `RenderError` boundary rather than a crash.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { present, renderChild, renderOptionalChild } from "../../formats/unicodemath/render-shared";

/** U+2601 CLOUD, for a background colour. */
const BACKGROUND = "☁";
/** U+270E LOWER RIGHT PENCIL, for a foreground colour. */
const FOREGROUND = "✎";

export function renderColor(node: NodeOf<"color">, context: RenderContext): string {
  // `options&.dig(:backgroundcolor)` is TRUTHINESS, not key presence: a nil or
  // false background is no background. Measured — bg nil and bg false both give
  // "\u270e(red&x)", only a real value gives "\u2601(red&x)".
  const operator = present(node.options?.backgroundcolor) ? BACKGROUND : FOREGROUND;
  // Both children are called WITHOUT `&.`, so neither nil nor false survives:
  // `Color.new(nil, x)` and `Color.new(false, x)` both raise NoMethodError.
  const one = renderChild(node.parameterOne, context, "color.parameterOne") ?? "";
  const two = renderChild(node.parameterTwo, context, "color.parameterTwo") ?? "";
  return `${operator}(${one}&${two})`;
}
