/**
 * Mirrors `function/sum.rb` — `Sum#to_unicodemath` (:93).
 *
 * Unlike `Int` and `Prod`, this inlines `_(…)` and `^(…)` rather than
 * calling `sub_value`/`sup_value` — so it does **not** get their mini-sized
 * or prime special cases, and a mini-sized limit is parenthesised here where
 * `Int` would emit it bare.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { naryandValue, present, unicodemathParens } from "../../formats/unicodemath/render-shared";

/** U+2211 N-ARY SUMMATION. */
const OPERATOR = "∑";

export function renderSum(node: NodeOf<"sum">, context: RenderContext): string {
  const sub = !present(node.parameterOne)
    ? ""
    : `_${unicodemathParens(node.parameterOne, context) ?? ""}`;
  const sup = !present(node.parameterTwo)
    ? ""
    : `^${unicodemathParens(node.parameterTwo, context) ?? ""}`;
  const mask = typeof node.options?.mask === "string" ? node.options.mask : "";
  return `${OPERATOR}${mask}${sub}${sup}${naryandValue(node.parameterThree, context)}`;
}
