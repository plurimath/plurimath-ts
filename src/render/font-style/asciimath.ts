/**
 * Mirrors `function/font_style.rb` — `FontStyle#to_asciimath` (:23) — and the
 * eight subclass overrides under `function/font_style/` that wrap their value
 * in a keyword (`bold.rb`, `double_struck.rb`, `fraktur.rb`, `italic.rb`,
 * `monospace.rb`, `normal.rb`, `sans-serif.rb`, `script.rb`).
 */

import {
  type NodeOf,
  type RenderContext,
  renderChild,
  s,
} from "../../formats/asciimath/render-shared";
import { ASCIIMATH_FONT_STYLE_KEYWORDS } from "../../generated/asciimath/render-tables";

/**
 * The `FontStyle` subclasses that override `to_asciimath` with a keyword
 * wrapper, and the keyword each emits — generated from live renders on the
 * oracle (`Bold.new(x)` → `mathbf(x)`, `render-tables.ts` in
 * `src/generated/asciimath`); the other six subclasses and the bare carrier
 * render their value with no wrapper at all. The emitted keyword is not
 * derivable from the parse table (`bb`, `mathbf` and `textbf` all *parse* to
 * `Bold`; only `mathbf` comes back out), which is why it is measured on the
 * render side.
 */
const FONT_STYLE_KEYWORDS: ReadonlyMap<string, string> = ASCIIMATH_FONT_STYLE_KEYWORDS;

export function renderFontStyle(node: NodeOf<"fontStyle">, context: RenderContext): string | null {
  const keyword = node.name === undefined ? undefined : FONT_STYLE_KEYWORDS.get(node.name);
  if (keyword !== undefined) {
    const body =
      node.parameterOne === null || node.parameterOne === undefined
        ? ""
        : s(renderChild(node.parameterOne, context, "fontStyle.parameterOne"));
    return `${keyword}(${body})`;
  }
  // `FontStyle#to_asciimath` is `parameter_one&.to_asciimath` — including the
  // six subclasses without an override. Nil in, Ruby-nil out: the caller
  // decides what nil means (`Nary` → "int", interpolation → "").
  if (node.parameterOne === null || node.parameterOne === undefined) return null;
  return renderChild(node.parameterOne, context, "fontStyle.parameterOne");
}
