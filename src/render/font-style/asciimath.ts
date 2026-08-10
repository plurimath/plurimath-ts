/**
 * Mirrors `function/font_style.rb` — `FontStyle#to_asciimath` (:23) — and the
 * eight subclass overrides under `function/font_style/` that wrap their value
 * in a keyword (`bold.rb`, `double_struck.rb`, `fraktur.rb`, `italic.rb`,
 * `monospace.rb`, `normal.rb`, `sans-serif.rb`, `script.rb`).
 */

import {
  classBasename,
  type NodeOf,
  type RenderContext,
  renderChild,
  s,
  unreachableName,
} from "../../formats/asciimath/render-shared";
import { ASCIIMATH_FONT_STYLE_KEYWORDS } from "../../generated/asciimath/render-tables";
import { ASCIIMATH_TRANSFORM_FONT_STYLES } from "../../generated/asciimath/transform-registry";

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

/**
 * The class names this carrier has measured behaviour for — the basenames the
 * transform's font-style table resolves to, which the oracle census confirms
 * is every `FontStyle` subclass (probe-subclass-census.rb, 2026-08-07: 14
 * subclasses, 8 overriding `to_asciimath`, 6 inheriting it). A defined name
 * outside the set raises rather than rendering the value alone, because the
 * class it would denote has no measured render here
 * (`unreachableName` in `../../formats/asciimath/render-shared.ts`).
 */
const MEASURED_FONT_STYLE_NAMES: ReadonlySet<string> = new Set(
  ASCIIMATH_TRANSFORM_FONT_STYLES.map((entry) => classBasename(entry.rubyClass)),
);

export function renderFontStyle(node: NodeOf<"fontStyle">, context: RenderContext): string | null {
  if (node.name !== undefined && !MEASURED_FONT_STYLE_NAMES.has(node.name))
    throw unreachableName(node.kind, node.name);
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
