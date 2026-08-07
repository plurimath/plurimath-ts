/**
 * Mirrors `function/oint.rb` — `Oint#to_latex` (:39): the int-shaped body,
 * except each subsup slot goes through `latex_wrapped` (inherited from
 * `TernaryFunction`, `ternary_function.rb:161` — `./shared.ts`) where
 * `Int`/`Sum`/`Prod` interpolate plainly. Measured, not guessed
 * (nary-op/Oint/formula-sub).
 */

import {
  latexWrapped,
  type NodeOf,
  nilSafe,
  present,
  type RenderContext,
  rubyStrip,
} from "./shared";

export function renderOint(node: NodeOf<"oint">, context: RenderContext): string {
  const one = present(node.parameterOne)
    ? `_${latexWrapped(node.parameterOne, context, "oint.parameterOne")}`
    : "";
  const two = present(node.parameterTwo)
    ? `^${latexWrapped(node.parameterTwo, context, "oint.parameterTwo")}`
    : "";
  const three = nilSafe(node.parameterThree, context, "oint.parameterThree");
  return rubyStrip(`\\oint${one}${two} ${three}`);
}
