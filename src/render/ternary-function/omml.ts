import { hasNodeKind, RenderError } from "../../core/index";
import {
  FORMAT,
  type NodeOf,
  ommlParameter,
  type RenderContext,
  structuralProperties,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderTernaryFunction(
  node: NodeOf<"ternaryFunction">,
  context: RenderContext,
): XmlElement {
  if (node.name === "TernaryFunction") {
    throw new RenderError(
      "TernaryFunction has no to_omml_without_math_tag in the pinned gem and refuses instead of emitting markup",
      FORMAT,
      node.kind,
    );
  }
  if (node.name !== "PowerBase") {
    throw new RenderError(
      `TernaryFunction alias "${node.name}" has not been measured for OMML in this slice`,
      FORMAT,
      node.kind,
    );
  }
  if (
    hasNodeKind(node.parameterOne) &&
    (node.parameterOne as { readonly kind: string }).kind === "nary"
  ) {
    throw new RenderError(
      "PowerBase over Nary takes an unmeasured under/over branch in the gem",
      FORMAT,
      node.kind,
    );
  }
  return new XmlElement("m:sSubSup").append(
    structuralProperties("sSubSup"),
    ommlParameter(node.parameterOne, "e", context, node.kind, "powerBase.parameterOne"),
    ommlParameter(node.parameterTwo, "sub", context, node.kind, "powerBase.parameterTwo"),
    ommlParameter(node.parameterThree, "sup", context, node.kind, "powerBase.parameterThree"),
  );
}
