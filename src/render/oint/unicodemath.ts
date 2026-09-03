/**
 * Mirrors `function/oint.rb` — `Oint#to_unicodemath` (:114).
 *
 * Unlike `Int` and `Prod`, this inlines `_(…)` and `^(…)` rather than
 * calling `sub_value`/`sup_value` — so it does **not** get their mini-sized
 * or prime special cases, and a mini-sized limit is parenthesised here where
 * `Int` would emit it bare.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import {
  naryandValue,
  present,
  rubyInterpolate,
  unicodemathParens,
} from "../../formats/unicodemath/render-shared";

/** U+222E CONTOUR INTEGRAL. */
const OPERATOR = "∮";

export function renderOint(node: NodeOf<"oint">, context: RenderContext): string {
  const sub = !present(node.parameterOne)
    ? ""
    : `_${unicodemathParens(node.parameterOne, context) ?? ""}`;
  const sup = !present(node.parameterTwo)
    ? ""
    : `^${unicodemathParens(node.parameterTwo, context) ?? ""}`;
  // `mask = self.options&.dig(:mask) if self.options&.key?(:mask)` and then a
  // bare `#{mask}`. Ruby interpolates ANY value through `to_s`, so a `typeof
  // === "string"` test silently dropped integers, `false` and symbols that the
  // gem prints. Measured: `mask: 5` gives "∑5…", `mask: false` gives "∑false…".
  const mask = rubyInterpolate(node.options?.mask, node.kind, "oint.options.mask");
  return `${OPERATOR}${mask}${sub}${sup}${naryandValue(node.parameterThree, context)}`;
}
