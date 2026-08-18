/**
 * Mirrors `function/color.rb` — `Color#to_unicodemath` (:65).
 *
 * The operator depends on the node's own options: `☁` for a background colour,
 * `✎` otherwise (`color.rb:71`). Neither parameter is guarded in the gem, so a
 * missing one raises there; here a null render becomes the empty string, which
 * is the port's `RenderError` boundary rather than a crash.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { renderOptionalChild } from "../../formats/unicodemath/render-shared";

/** U+2601 CLOUD, for a background colour. */
const BACKGROUND = "☁";
/** U+270E LOWER RIGHT PENCIL, for a foreground colour. */
const FOREGROUND = "✎";

export function renderColor(node: NodeOf<"color">, context: RenderContext): string {
  const operator = node.options?.backgroundcolor === undefined ? FOREGROUND : BACKGROUND;
  const one = renderOptionalChild(node.parameterOne, context);
  const two = renderOptionalChild(node.parameterTwo, context);
  return `${operator}(${one}&${two})`;
}
