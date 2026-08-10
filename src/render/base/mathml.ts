/**
 * Mirrors `function/base.rb` — `Base#to_mathml_without_math_tag` (:44):
 * `<munder>` when the first slot's `class_name` is in `MUNDER_CLASSES`
 * (generated: ubrace/obrace/right/max/min — probes base-munder-max,
 * base-munder-ubrace), `<msub>` otherwise; the two slots through
 * `validate_mathml_fields` — nil contributes nothing, a LIST field maps
 * per element.
 */

import {
  classNameOf,
  type NodeOf,
  type RenderContext,
  validateMathmlFields,
} from "../../formats/mathml/render-shared";
import { MATHML_MUNDER_CLASS_NAMES } from "../../generated/mathml/render-tables";
import { XmlElement } from "../../xml/index";

const MUNDER_NAMES: ReadonlySet<string> = new Set(MATHML_MUNDER_CLASS_NAMES);

export function renderBase(node: NodeOf<"base">, context: RenderContext): XmlElement {
  const className = classNameOf(node.parameterOne);
  const tag = className !== undefined && MUNDER_NAMES.has(className) ? "munder" : "msub";
  return new XmlElement(tag).append(
    validateMathmlFields(node.parameterOne, context, "base.parameterOne"),
    validateMathmlFields(node.parameterTwo, context, "base.parameterTwo"),
  );
}
