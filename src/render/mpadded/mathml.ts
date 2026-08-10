/**
 * Mirrors `function/mpadded.rb` — `Mpadded#to_mathml_without_math_tag`
 * (:33): `<mpadded attrs=options>` over the inherited `mathml_value` —
 * options straight into `set_attr` with no guard, so a non-hash crashes the
 * gem (probe mpadded-nonhash-options) and raises here; an empty hash writes
 * nothing (probe mpadded-empty-hash).
 */

import {
  hashOrNil,
  mathmlValue,
  type NodeOf,
  type RenderContext,
  setAttributesFromHash,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderMpadded(node: NodeOf<"mpadded">, context: RenderContext): XmlElement {
  const mpadded = new XmlElement("mpadded");
  const options = hashOrNil(node.options, node.kind, "mpadded.options");
  if (options !== null) setAttributesFromHash(mpadded, options, node.kind, "mpadded.options");
  return mpadded.append(mathmlValue(node.parameterOne, context, "mpadded.parameterOne"));
}
