import { BaseNode } from "../../core/index";
import {
  type NodeOf,
  type OmmlRendered,
  ommlSlot,
  present,
  type RenderContext,
  renderOverUnder,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderUnderset(node: NodeOf<"underset">, context: RenderContext): OmmlRendered {
  if (!context.displaystyle) {
    return context.render(
      new BaseNode({ parameterOne: node.parameterOne, parameterTwo: node.parameterTwo }),
    );
  }

  if (!present(node.options.accentunder)) {
    return renderOverUnder(node.kind, "Low", node.parameterOne, node.parameterTwo, context);
  }

  const properties = new XmlElement("m:groupChrPR").append(
    new XmlElement("m:chr").setAttribute("m:val", "_"),
    new XmlElement("m:pos").setAttribute("m:val", "bot"),
  );
  return new XmlElement("m:groupChr").append(
    properties,
    ommlSlot(node.parameterTwo, "e", context, node.kind, "underset.parameterTwo"),
  );
}
