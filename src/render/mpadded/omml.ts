import { RenderError } from "../../core/index";
import { assertReproducibleRubyHashOrder } from "../../core/ruby-semantics";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  ommlSlot,
  type RenderContext,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

const ZERO_TAGS: Readonly<Record<string, string>> = {
  height: "zeroAsc",
  depth: "zeroDesc",
  width: "zeroWid",
};

/** `Mpadded#to_omml_without_math_tag`: the gem's phantom wrapper and zero flags. */
export function renderMpadded(node: NodeOf<"mpadded">, context: RenderContext): XmlElement {
  const properties = new XmlElement("m:phantPr");
  const options = node.options ?? {};
  assertReproducibleRubyHashOrder(options, FORMAT, node.kind, "mpadded.options");
  for (const [name, value] of Object.entries(options)) {
    if (typeof value !== "string") {
      throw new RenderError(
        `mpadded.options.${name}: holds ${describeSlot(value)} — the gem sends match? ` +
          "to every option value and raises NoMethodError here",
        FORMAT,
        node.kind,
      );
    }
    if (!/[1-9]/.test(value) && /\d/.test(value)) {
      properties.append(new XmlElement(ZERO_TAGS[name] ?? "").setAttribute("m:val", "on"));
    }
  }

  return new XmlElement("m:phant").append(
    properties.children.length === 0 ? null : properties,
    ommlSlot(node.parameterOne, "e", context, node.kind, "mpadded.parameterOne"),
  );
}
