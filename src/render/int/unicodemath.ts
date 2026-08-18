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
} from "../../formats/unicodemath/render-shared";

/** U+222B INTEGRAL. */
const INTEGRAL = "∫";

export function renderInt(node: NodeOf<"int">, context: RenderContext): string {
  const sub = !present(node.parameterOne) ? "" : naryandSubValue(node.parameterOne, context);
  const sup = !present(node.parameterTwo) ? "" : naryandSupValue(node.parameterTwo, context);
  const mask = typeof node.options?.mask === "string" ? node.options.mask : "";
  return `${INTEGRAL}${mask}${sub}${sup}${naryandValue(node.parameterThree, context)}`;
}
