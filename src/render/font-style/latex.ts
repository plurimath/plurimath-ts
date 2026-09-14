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
  unreachableName,
} from "../../formats/latex/render-shared";
import {
  LATEX_FONT_STYLE_COMMANDS,
  LATEX_FONT_STYLE_NAMES,
} from "../../generated/latex/render-tables";

/**
 * The `FontStyle` subclasses that override `to_latex` with a `\math..`
 * wrapper, and the command each emits — generated from live renders of
 * every subclass; the other six subclasses and the bare carrier render
 * their value with no wrapper at all (nil in, Ruby-nil out).
 */
const FONT_STYLE_COMMANDS: ReadonlyMap<string, string> = LATEX_FONT_STYLE_COMMANDS;

/**
 * The class names this carrier has measured behaviour for — the full gem
 * subclass set, generated (`LATEX_FONT_STYLE_NAMES`,
 * `src/generated/latex/render-tables.ts`; exactly 14 subclasses, the 8
 * command classes overriding `to_latex` and these 6 inheriting the
 * value-alone default). Unlike the command half, this full set is not
 * derivable from the transform registry (the asciimath side derives it from
 * its transform registry, which this format may not import — §3's
 * generated-data closure), so it is measured directly off the class
 * hierarchy. Every entry is pinned by a behavioural render in
 * `test/formats/latex/renderer.spec.ts`; a defined name outside the set
 * raises rather than rendering the value alone, because the class it would
 * denote has no measured render here (`unreachableName` in
 * `../../formats/latex/render-shared.ts`). The bare carrier — name
 * undefined — keeps its measured value-alone render.
 */
const MEASURED_FONT_STYLE_NAMES: ReadonlySet<string> = new Set(LATEX_FONT_STYLE_NAMES);

export function renderFontStyle(node: NodeOf<"fontStyle">, context: RenderContext): string | null {
  if (node.name !== undefined && !MEASURED_FONT_STYLE_NAMES.has(node.name))
    throw unreachableName(node.kind, node.name);
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
