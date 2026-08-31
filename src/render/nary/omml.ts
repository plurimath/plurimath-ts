import { hasNodeKind, RenderError } from "../../core/index";
import {
  controlProperties,
  FORMAT,
  type NodeOf,
  ommlSlot,
  type RenderContext,
  requireEmptyOptions,
  symbolValueOrGenerated,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderNary(node: NodeOf<"nary">, context: RenderContext): XmlElement {
  requireEmptyOptions(node.options, node.kind, "nary.options");
  const first = node.parameterOne;
  const operatorValue =
    first === null || first === undefined
      ? ""
      : hasNodeKind(first) && (first as { readonly kind: string }).kind === "symbol"
        ? symbolValueOrGenerated(first as NodeOf<"symbol">, node.kind, "nary.parameterOne")
        : null;
  if (operatorValue === null) {
    throw new RenderError(
      "nary.parameterOne: only the measured generic Symbol operator is implemented in this slice",
      FORMAT,
      node.kind,
    );
  }
  const properties = new XmlElement("m:naryPr").append(
    new XmlElement("m:chr").setAttribute("m:val", operatorValue),
    new XmlElement("m:limLoc").setAttribute("m:val", "subSup"),
    node.parameterTwo === null ? new XmlElement("m:subHide").setAttribute("m:val", "1") : null,
    node.parameterThree === null ? new XmlElement("m:supHide").setAttribute("m:val", "1") : null,
    controlProperties(),
  );
  return new XmlElement("m:nary").append(
    properties,
    ommlSlot(node.parameterTwo, "sub", context, node.kind, "nary.parameterTwo"),
    ommlSlot(node.parameterThree, "sup", context, node.kind, "nary.parameterThree"),
    ommlSlot(node.parameterFour, "e", context, node.kind, "nary.parameterFour"),
  );
}
