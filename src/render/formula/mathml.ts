/**
 * Mirrors `formula.rb` — `Formula#to_mathml_without_math_tag` (:121) and
 * `#mathml_content` (:133): a formula with a falsy `left_right_wrapper`
 * returns its rendered children RAW (an array `update_nodes` splices —
 * probe formula-nowrap), a truthy one wraps them in `<mrow>` (with no
 * attributes: `intent_attribute` runs only under `intent`, which is
 * deferred). The child map is strict — a bare string in `value` (the gem's
 * own parse of `""` puts one there) raises NoMethodError in the gem and
 * `RenderError` here.
 */

import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type MathmlRendered,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  unreachableName,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

/**
 * The class names this carrier has measured behaviour for — `Mstyle`, the
 * one class the census folds onto `Formula` (its
 * `to_mathml_without_math_tag` owner is `Math::Formula`; probe mstyle
 * renders byte-identically to the bare carrier). The same hand-listed set
 * the asciimath formula file guards, same justification.
 */
const MEASURED_FORMULA_NAMES: ReadonlySet<string> = new Set(["Mstyle"]);

export function renderFormula(node: NodeOf<"formula">, context: RenderContext): MathmlRendered {
  if (node.name !== undefined && !MEASURED_FORMULA_NAMES.has(node.name))
    throw unreachableName(node.kind, node.name);
  return renderFormulaMathml(node.value, node.leftRightWrapper, context, "formula");
}

/**
 * The shared body, exported for `../mrow/mathml.ts` (`Mrow` is a `Formula`
 * subclass inheriting `to_mathml_without_math_tag` unchanged).
 */
export function renderFormulaMathml(
  value: unknown,
  leftRightWrapper: unknown,
  context: RenderContext,
  at: string,
): MathmlRendered {
  if (!Array.isArray(value)) {
    throw new RenderError(
      `${at}.value: is ${describeSlot(value)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      at,
    );
  }
  const children = value.map((item) => renderChild(item, context, `${at}.value`));
  if (!present(leftRightWrapper)) return children;
  return new XmlElement("mrow").append(children);
}
