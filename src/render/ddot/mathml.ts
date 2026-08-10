/**
 * Mirrors `function/ddot.rb` — `Ddot#to_mathml_without_math_tag` (:9):
 * `<mover accent="true">` over `mathml_value << <mo>..</mo>` — the accent
 * is HARDCODED and the node's own `attributes` slot is never read (probes
 * ddot-x / ddot-nil). `mathml_value` semantics (list compaction, nil to
 * nothing) come from the shared helper.
 */

import { mathmlValue, type NodeOf, type RenderContext } from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderDdot(node: NodeOf<"ddot">, context: RenderContext): XmlElement {
  const parts = mathmlValue(node.parameterOne, context, "ddot.parameterOne");
  parts.push(new XmlElement("mo").append(".."));
  return new XmlElement("mover").setAttribute("accent", "true").append(parts);
}
