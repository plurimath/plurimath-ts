/**
 * Mirrors `function/font_style.rb` — `FontStyle#to_latex` (:53) — and the
 * eight subclass overrides under `function/font_style/` that wrap their value
 * in a `\math..` command (`bold.rb:17` and its siblings).
 */

import {
  type NodeOf,
  nilSafe,
  type RenderContext,
  renderChild,
} from "../../formats/latex/render-shared";
import { LATEX_FONT_STYLE_COMMANDS } from "../../generated/latex/render-tables";

/**
 * The `FontStyle` subclasses that override `to_latex` with a `\math..`
 * wrapper, and the command each emits — generated from live renders of
 * every subclass; the other six subclasses and the bare carrier render
 * their value with no wrapper at all (nil in, Ruby-nil out).
 */
const FONT_STYLE_COMMANDS: ReadonlyMap<string, string> = LATEX_FONT_STYLE_COMMANDS;

export function renderFontStyle(node: NodeOf<"fontStyle">, context: RenderContext): string | null {
  const command = node.name === undefined ? undefined : FONT_STYLE_COMMANDS.get(node.name);
  if (command !== undefined) {
    // `"\\mathbf{#{parameter_one&.to_latex}}"` — nil-safe (`bold.rb:17`).
    return `${command}{${nilSafe(node.parameterOne, context, "fontStyle.parameterOne")}}`;
  }
  // `FontStyle#to_latex` is `parameter_one&.to_latex` (`font_style.rb:53`) —
  // including the six subclasses without an override. Nil in, Ruby-nil out.
  if (node.parameterOne === null || node.parameterOne === undefined) return null;
  return renderChild(node.parameterOne, context, "fontStyle.parameterOne");
}
