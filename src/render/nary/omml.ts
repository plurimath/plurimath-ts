import { hasNodeKind, RenderError } from "../../core/index";
import {
  controlProperties,
  FORMAT,
  type NodeOf,
  ommlParameter,
  type RenderContext,
  requireEmptyOptions,
  symbolValueOrGenerated,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderNary(node: NodeOf<"nary">, context: RenderContext): XmlElement {
  requireEmptyOptions(node.options, node.kind, "nary.options");
  const first = node.parameterOne;
  if (!hasNodeKind(first) || (first as { readonly kind: string }).kind !== "symbol") {
    throw new RenderError(
      "nary.parameterOne: only the measured generic Symbol operator is implemented in this slice",
      FORMAT,
      node.kind,
    );
  }
  const operator = first as NodeOf<"symbol">;

  const properties = new XmlElement("m:naryPr").append(
    new XmlElement("m:chr").setAttribute(
      "m:val",
      symbolValueOrGenerated(operator, node.kind, "nary.parameterOne"),
    ),
    new XmlElement("m:limLoc").setAttribute("m:val", "subSup"),
    controlProperties(),
  );
  return new XmlElement("m:nary").append(
    properties,
    ommlParameter(node.parameterTwo, "sub", context, node.kind, "nary.parameterTwo"),
    ommlParameter(node.parameterThree, "sup", context, node.kind, "nary.parameterThree"),
    ommlParameter(node.parameterFour, "e", context, node.kind, "nary.parameterFour"),
  );
}
