/**
 * Mirrors `function/int.rb` — `Int#to_unicodemath` (:91).
 *
 * `mask` comes from the NODE's own options (`self.options[:mask]`), not the
 * render options. `Prod` reads the render options in the same position, which
 * looks like a gem bug and is ported as-is over there.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import {
  naryandSubValue,
  naryandSupValue,
  naryandValue,
  present,
  rubyInterpolate,
} from "../../formats/unicodemath/render-shared";

/** U+222B INTEGRAL. */
const INTEGRAL = "∫";

export function renderInt(node: NodeOf<"int">, context: RenderContext): string {
  const sub = !present(node.parameterOne) ? "" : naryandSubValue(node.parameterOne, context);
  const sup = !present(node.parameterTwo) ? "" : naryandSupValue(node.parameterTwo, context);
  // `mask = self.options&.dig(:mask) if self.options&.key?(:mask)` and then a
  // bare `#{mask}`. Ruby interpolates ANY value through `to_s`, so a `typeof
  // === "string"` test silently dropped integers, `false` and symbols that the
  // gem prints. Measured: `mask: 5` gives "∑5…", `mask: false` gives "∑false…".
  const mask = rubyInterpolate(node.options?.mask, node.kind, "int.options.mask");
  return `${INTEGRAL}${mask}${sub}${sup}${naryandValue(node.parameterThree, context)}`;
}
