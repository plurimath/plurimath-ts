/**
 * Mirrors `function/overset.rb` — `Overset#to_mathml_without_math_tag`
 * (:24): `<mover attrs=options>` over [SECOND slot, FIRST slot] — the gem
 * swaps them (probe overset: `Overset.new(x, y)` renders y above... first) —
 * each through `validate_mathml_fields`.
 */

import {
  hashOrNil,
  type NodeOf,
  type RenderContext,
  setAttributesFromHash,
  validateMathmlFields,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderOverset(node: NodeOf<"overset">, context: RenderContext): XmlElement {
  const mover = new XmlElement("mover");
  const options = hashOrNil(node.options, node.kind, "overset.options");
  if (options !== null) setAttributesFromHash(mover, options, node.kind, "overset.options");
  return mover.append(
    validateMathmlFields(node.parameterTwo, context, "overset.parameterTwo"),
    validateMathmlFields(node.parameterOne, context, "overset.parameterOne"),
  );
}
