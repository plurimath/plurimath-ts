import {
  type NodeOf,
  ommlSlot,
  plainRun,
  type RenderContext,
  rubyTruthy,
  structuralProperties,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

const BRACE = "⏞";

export function renderObrace(node: NodeOf<"obrace">, context: RenderContext): XmlElement {
  if (node.parameterOne === null || node.parameterOne === undefined) return plainRun(BRACE);

  if (rubyTruthy(node.attributes.accent)) {
    return new XmlElement("m:acc").append(
      new XmlElement("m:accPr").append(new XmlElement("m:chr").setAttribute("m:val", BRACE)),
      ommlSlot(node.parameterOne, "e", context, node.kind, "obrace.parameterOne"),
    );
  }

  return new XmlElement("m:limUpp").append(
    structuralProperties("limUpp"),
    ommlSlot(
      node.parameterOne,
      "e",
      context.withDisplaystyle(true),
      node.kind,
      "obrace.parameterOne",
    ),
    new XmlElement("m:lim").append(plainRun(BRACE)),
  );
}
