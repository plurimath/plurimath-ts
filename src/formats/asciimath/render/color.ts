/**
 * Mirrors `function/color.rb` — `Color#to_asciimath` (:22):
 * `"color(#{one&.gsub(/\s/, '')})(#{two})"` — both slots always wrapped.
 *
 * Measured pin: the gsub strips Ruby `/\s/` — `[ \t\r\n\f\v]`, NOT the
 * no-break space (measured: `color("a\u{A0}b")(x)`).
 */

import { type NodeOf, type RenderContext, renderChild, s, stripRubyWhitespace } from "./shared";

export function renderColor(node: NodeOf<"color">, context: RenderContext): string {
  const one =
    node.parameterOne === null || node.parameterOne === undefined
      ? ""
      : stripRubyWhitespace(s(renderChild(node.parameterOne, context, "color.parameterOne")));
  const two =
    node.parameterTwo === null || node.parameterTwo === undefined
      ? ""
      : s(renderChild(node.parameterTwo, context, "color.parameterTwo"));
  return `color(${one})(${two})`;
}
