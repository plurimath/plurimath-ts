import { hasNodeKind, RenderError } from "../../core/index";
import {
  FORMAT,
  type NodeOf,
  ommlSlot,
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
  if (Array.isArray(node.parameterOne)) {
    throw new RenderError(
      "powerBase.parameterOne: cannot inspect a list for omml_tag_name — the gem raises NoMethodError here",
      FORMAT,
      node.kind,
    );
  }
  // `PowerBase` reads its base before the slot helper does, so this slot is NOT
  // Ruby-falsy the way an ordinary `omml_parameter` slot is. Measured on the
  // oracle at `00c52783`: `PowerBase.new(nil, a, a)` renders with the
  // zero-width-space placeholder, while `PowerBase.new(false, a, a)` raises —
  // `false` answers none of the methods the base is asked for. Sending both
  // through `ommlSlot` placeholdered the `false` case and invented output the
  // gem refuses.
  if ((node.parameterOne as unknown) === false) {
    throw new RenderError(
      "powerBase.parameterOne: is false, which answers no omml tag method — the gem raises here, though it renders a placeholder for nil",
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
    ommlSlot(node.parameterOne, "e", context, node.kind, "powerBase.parameterOne"),
    ommlSlot(node.parameterTwo, "sub", context, node.kind, "powerBase.parameterTwo"),
    ommlSlot(node.parameterThree, "sup", context, node.kind, "powerBase.parameterThree"),
  );
}
