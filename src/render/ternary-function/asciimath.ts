/**
 * Mirrors `function/ternary_function.rb` — `TernaryFunction#to_asciimath`
 * (:26) and `#ascii_wrap` (:188). The census folds one AsciiMath-reachable
 * class into this carrier: `PowerBase` (`power_base.rb`, constructed directly
 * by `newPowerBase` in `../../formats/asciimath/transform.ts`), which adds nothing to the carrier
 * default.
 */

import type { NodeParameter } from "../../core/index";
import {
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  s,
  slotKind,
  unreachableName,
  wrapped,
} from "../../formats/asciimath/render-shared";

const REACHABLE_TERNARY_NAMES: ReadonlySet<string> = new Set(["PowerBase"]);

export function renderTernaryFunction(
  node: NodeOf<"ternaryFunction">,
  context: RenderContext,
): string {
  if (!REACHABLE_TERNARY_NAMES.has(node.name)) throw unreachableName(node.kind, node.name);
  // `TernaryFunction#to_asciimath` — `PowerBase` adds nothing to it.
  const one = present(node.parameterOne)
    ? asciiWrap(node.parameterOne, context, "ternaryFunction.parameterOne")
    : "";
  const two = present(node.parameterTwo)
    ? `_${wrapped(node.parameterTwo, context, "ternaryFunction.parameterTwo")}`
    : "";
  const three = present(node.parameterThree)
    ? `^${wrapped(node.parameterThree, context, "ternaryFunction.parameterThree")}`
    : "";
  return `${one}${two}${three}`;
}

/**
 * `TernaryFunction#ascii_wrap` (`ternary_function.rb:188`): parenthesizes
 * ONLY a formula (`Mrow` and `Mstyle` included — they are `Formula`
 * subclasses). The `field.class.name.include?("Function")` arm is dead code
 * in the gem (it sits after `||` on the class itself), so `sin x` in a first
 * slot stays bare. The obrace/ubrace early return is equally inert — neither
 * is a `Formula` — but it is the gem's code path, so the answer is the same.
 */
function asciiWrap(value: NodeParameter | undefined, context: RenderContext, at: string): string {
  const rendered = s(renderChild(value, context, at));
  const kind = slotKind(value);
  return kind === "formula" || kind === "mrow" ? `(${rendered})` : rendered;
}
