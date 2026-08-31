import { RenderError } from "../../core/index";
import {
  FORMAT,
  insertChild,
  type NodeOf,
  ommlSlot,
  type RenderContext,
  requireNodeList,
  structuralProperties,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderBinaryFunction(
  node: NodeOf<"binaryFunction">,
  context: RenderContext,
): XmlElement {
  switch (node.name) {
    case "BinaryFunction":
      return new XmlElement("m:r").append(
        insertChild(node.parameterOne, context, "binaryFunction.parameterOne"),
        insertChild(node.parameterTwo, context, "binaryFunction.parameterTwo"),
      );
    case "Power":
      return new XmlElement("m:sSup").append(
        structuralProperties("sSup"),
        ommlSlot(node.parameterOne, "e", context, node.kind, "power.parameterOne"),
        ommlSlot(node.parameterTwo, "sup", context, node.kind, "power.parameterTwo"),
      );
    case "Td":
      return renderTd(node, context);
    default:
      throw new RenderError(
        `BinaryFunction alias "${node.name}" has not been measured for OMML in this slice`,
        FORMAT,
        node.kind,
      );
  }
}

function renderTd(node: NodeOf<"binaryFunction">, context: RenderContext): XmlElement {
  const values = requireNodeList(node.parameterOne, node.kind, "td.parameterOne");
  if (values.length === 0) {
    throw new RenderError(
      "td.parameterOne: the empty-cell branch is deferred until separately measured",
      FORMAT,
      node.kind,
    );
  }
  const cell = new XmlElement("m:e");
  values.forEach((value, index) => {
    cell.append(insertChild(value, context, `td.parameterOne[${index}]`));
  });
  return cell;
}
