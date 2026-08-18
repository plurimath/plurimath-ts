/**
 * Mirrors `function/unary_function.rb` — `UnaryFunction#to_unicodemath` (:90).
 *
 * The carrier for every unary the census folds in here. The gem writes
 * `"#{class_name}⁡#{parameter_one…}"`, and `class_name` is reflection —
 * `self.class.name.split("::").last.downcase` (`core.rb:28`). There is no
 * reflection to lean on here, so the name comes from the node's own class id,
 * lowercased, which is what that expression evaluates to for these classes.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { className, renderOptionalChild } from "../../formats/unicodemath/render-shared";

/** U+2061 FUNCTION APPLICATION — invisible, but a real character. */
const APPLY = "⁡";

export function renderUnaryFunction(node: NodeOf<"unaryFunction">, context: RenderContext): string {
  const inner = renderOptionalChild(node.parameterOne, context);
  return `${className(node.name)}${APPLY}${inner}`;
}
