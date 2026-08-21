/**
 * Mirrors `function/underset.rb` — `Underset#to_mathml_without_math_tag`
 * (:24): `<munder attrs=options>` over [SECOND slot, FIRST slot], exactly
 * overset's swap with the under tag (probes underset / underset-options).
 */

import {
  hashOrNil,
  type NodeOf,
  type RenderContext,
  setAttributesFromHash,
  validateMathmlFields,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderUnderset(node: NodeOf<"underset">, context: RenderContext): XmlElement {
  const munder = new XmlElement("munder");
  const options = hashOrNil(node.options, node.kind, "underset.options");
  if (options !== null) setAttributesFromHash(munder, options, node.kind, "underset.options");
  return munder.append(
    validateMathmlFields(node.parameterTwo, context, "underset.parameterTwo"),
    validateMathmlFields(node.parameterOne, context, "underset.parameterOne"),
  );
}
