import { RenderError } from "../../core/index";
import {
  controlProperties,
  describeSlot,
  FORMAT,
  type NodeOf,
  ommlSlot,
  type RenderContext,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderFrac(node: NodeOf<"frac">, context: RenderContext): XmlElement {
  return new XmlElement("m:f").append(
    fractionProperties(node),
    ommlSlot(node.parameterOne, "num", context, node.kind, "frac.parameterOne"),
    ommlSlot(node.parameterTwo, "den", context, node.kind, "frac.parameterTwo"),
  );
}

/**
 * `Frac#fpr_element` (frac.rb:139-147) and `#attr_value` (:149-155):
 *
 * ```ruby
 * if options
 *   fpr_element << XmlHelper.ox_element("type", namespace: "m", attributes: { "m:val": attr_value })
 * end
 * options[:linethickness] == "0" ? "noBar" : (options[:bevelled] == "true" ? "skw" : "bar")
 * ```
 *
 * `Frac#initialize` (frac.rb:19-21) stores options only when they are truthy
 * and non-empty, so an empty hash (or Array, or String) is the absent one — a `{}` gives no
 * `m:type` (measured on the oracle at `00c52783`, as does `false`). Any hash
 * that survives gets an `m:type`, even one holding neither key
 * (`{ldiv: true}` gives `bar`, measured): `noBar` wins over `skw` when both
 * are set, and the values compare as the STRINGS `"0"` and `"true"` (an
 * integer `0` gives `bar`). A slot that is not a hash reaches `options[:key]`
 * and raises — a String or Array with `TypeError` (measured).
 */
function fractionProperties(node: NodeOf<"frac">): XmlElement {
  const properties = new XmlElement("m:fPr");
  const options: unknown = node.options;
  if (options !== null && options !== undefined && options !== false && !isEmpty(options)) {
    if (typeof options !== "object" || Array.isArray(options)) {
      throw new RenderError(
        `frac.options: is ${describeSlot(options)}, not a hash — the gem raises reading options[:linethickness]`,
        FORMAT,
        node.kind,
      );
    }
    const hash = options as Readonly<Record<string, unknown>>;
    const type = hash.linethickness === "0" ? "noBar" : hash.bevelled === "true" ? "skw" : "bar";
    properties.append(new XmlElement("m:type").setAttribute("m:val", type));
  }
  return properties.append(controlProperties());
}

/** Ruby `empty?` on the carriers that answer it: an empty Hash, Array or String. */
function isEmpty(value: unknown): boolean {
  if (typeof value === "string" || Array.isArray(value)) return value.length === 0;
  return typeof value === "object" && value !== null && Object.keys(value as object).length === 0;
}
