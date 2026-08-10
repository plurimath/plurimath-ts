/**
 * Mirrors `function/frac.rb` — `Frac#to_mathml_without_math_tag` (:31):
 * `<mfrac>` — or `<mrow>` under `hide_function_name` (probe frac-hide) —
 * over the two nil-safe slots. With the `mfrac` tag and a truthy `options`
 * hash, every option except `:choose` becomes an attribute (probes
 * frac-options / frac-options-choose); the reject runs on a hash only —
 * `Frac.new(x, y, "zz")` crashes the gem and raises here.
 */

import {
  hashOrNil,
  type NodeOf,
  present,
  type RenderContext,
  renderChild,
  setAttributesFromHash,
} from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderFrac(node: NodeOf<"frac">, context: RenderContext): XmlElement {
  const tagName = present(node.hideFunctionName) ? "mrow" : "mfrac";
  const frac = new XmlElement(tagName);
  if (tagName === "mfrac" && present(node.options)) {
    const options = hashOrNil(node.options, node.kind, "frac.options");
    if (options !== null) {
      const kept = Object.fromEntries(Object.entries(options).filter(([key]) => key !== "choose"));
      setAttributesFromHash(frac, kept, node.kind, "frac.options");
    }
  }
  return frac.append(
    node.parameterOne === null || node.parameterOne === undefined
      ? null
      : renderChild(node.parameterOne, context, "frac.parameterOne"),
    node.parameterTwo === null || node.parameterTwo === undefined
      ? null
      : renderChild(node.parameterTwo, context, "frac.parameterTwo"),
  );
}
