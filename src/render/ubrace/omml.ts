import {
  type NodeOf,
  ommlSlot,
  plainRun,
  type RenderContext,
  rubyTruthy,
  structuralProperties,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

const BRACE = "⏟";

export function renderUbrace(node: NodeOf<"ubrace">, context: RenderContext): XmlElement {
  // `return r_element("⏟", rpr_tag: false) unless parameter_one` — Ruby-falsy,
  // so `false` takes the bare-brace path alongside `nil`.
  if (!rubyTruthy(node.parameterOne)) return plainRun(BRACE);

  return new XmlElement("m:limLow").append(
    structuralProperties("limLow"),
    ommlSlot(
      node.parameterOne,
      "e",
      context.withDisplaystyle(true),
      node.kind,
      "ubrace.parameterOne",
    ),
    new XmlElement("m:lim").append(plainRun(BRACE)),
  );
}
