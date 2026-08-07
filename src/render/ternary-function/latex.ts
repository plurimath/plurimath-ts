/**
 * Mirrors `function/ternary_function.rb` — `TernaryFunction#to_latex` (:52)
 * and `#latex_wrapped` (:161, hoisted to `../../formats/latex/render-shared.ts` beside its
 * byte-equivalent binary twin). The census folds one AsciiMath-reachable
 * class into this carrier: `PowerBase` (`power_base.rb:25`, constructed
 * directly by `newPowerBase` in `../../asciimath/transform.ts`), whose own
 * `to_latex` override is what renders here.
 */

import {
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
  unreachableName,
} from "../../formats/latex/render-shared";

const REACHABLE_TERNARY_NAMES: ReadonlySet<string> = new Set(["PowerBase"]);

export function renderTernaryFunction(
  node: NodeOf<"ternaryFunction">,
  context: RenderContext,
): string {
  if (!REACHABLE_TERNARY_NAMES.has(node.name)) throw unreachableName(node.kind, node.name);
  // `PowerBase#to_latex` (`power_base.rb:25`): `_{…}^{…}` are BOTH always
  // present, whatever is nil; the first slot is never braced.
  const one = present(node.parameterOne)
    ? renderChild(node.parameterOne, context, "ternaryFunction.parameterOne")
    : null;
  const two = present(node.parameterTwo)
    ? renderChild(node.parameterTwo, context, "ternaryFunction.parameterTwo")
    : null;
  const three = present(node.parameterThree)
    ? renderChild(node.parameterThree, context, "ternaryFunction.parameterThree")
    : null;
  return `${s(one)}_{${s(two)}}^{${s(three)}}`;
}
