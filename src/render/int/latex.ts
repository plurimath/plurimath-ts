/**
 * Mirrors `function/int.rb` — `Int#to_latex` (:40): plain `_{…}`/`^{…}`
 * interpolation (not `latex_wrapped` — measured against `Oint`, see
 * `../oint/latex.ts`), a ` #{third}` append, then Ruby `String#strip`, whose
 * whitespace set is `[\0\t\n\v\f\r ]` — the no-break space stays. The gem
 * repeats this body in `sum.rb` and `prod.rb` (each spelling its own
 * command); so does this port, one file per class (`../sum/latex.ts`, `../prod/latex.ts`).
 */

import {
  type NodeOf,
  nilSafe,
  present,
  type RenderContext,
  renderChild,
  rubyStrip,
  s,
} from "../../formats/latex/render-shared";

export function renderInt(node: NodeOf<"int">, context: RenderContext): string {
  const one = present(node.parameterOne)
    ? `_{${s(renderChild(node.parameterOne, context, "int.parameterOne"))}}`
    : "";
  const two = present(node.parameterTwo)
    ? `^{${s(renderChild(node.parameterTwo, context, "int.parameterTwo"))}}`
    : "";
  const three = nilSafe(node.parameterThree, context, "int.parameterThree");
  return rubyStrip(`\\int${one}${two} ${three}`);
}
