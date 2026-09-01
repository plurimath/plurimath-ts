import { hasNodeKind, RenderError } from "../../core/index";
import { htmlEntityToUnicode } from "../../core/nodes";
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

/**
 * `Nary#chr_value` (nary.rb:155-160) writes the operator DECODED, and then
 * suppresses the whole `m:chr` element for exactly one value:
 *
 * ```ruby
 * first_value = Utility.html_entity_to_unicode(parameter_one&.nary_attr_value(options: options))
 * unless first_value == "∫"
 *   narypr << XmlHelper.ox_element("chr", namespace: "m", attributes: { "m:val": first_value })
 * ```
 *
 * Measured on the oracle at `00c52783` over `Nary(Symbol(v), x, x, x, {})`:
 * `"∫"`, `"&#x222b;"` and `"&#x222B;"` each give an `m:naryPr` whose first
 * child is `m:limLoc`, while `"&#x2211;"` gives `<m:chr m:val="∑"/>` — the
 * decoded character, never the entity as written.
 */
const SUPPRESSED_NARY_OPERATOR = "∫";

export function renderNary(node: NodeOf<"nary">, context: RenderContext): XmlElement {
  requireEmptyOptions(node.options, node.kind, "nary.options");
  const first = node.parameterOne;
  const rawOperator =
    first === null || first === undefined
      ? ""
      : hasNodeKind(first) && (first as { readonly kind: string }).kind === "symbol"
        ? symbolValueOrGenerated(first as NodeOf<"symbol">, node.kind, "nary.parameterOne")
        : null;
  if (rawOperator === null) {
    throw new RenderError(
      "nary.parameterOne: only the measured generic Symbol operator is implemented in this slice",
      FORMAT,
      node.kind,
    );
  }
  const operatorValue = htmlEntityToUnicode(rawOperator);
  const properties = new XmlElement("m:naryPr").append(
    operatorValue === SUPPRESSED_NARY_OPERATOR
      ? null
      : new XmlElement("m:chr").setAttribute("m:val", operatorValue),
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
