import {
  type NodeOf,
  ommlSlot,
  plainRun,
  type RenderContext,
  structuralProperties,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

const BRACE = "⏟";

export function renderUbrace(node: NodeOf<"ubrace">, context: RenderContext): XmlElement {
  if (node.parameterOne === null || node.parameterOne === undefined) return plainRun(BRACE);

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
