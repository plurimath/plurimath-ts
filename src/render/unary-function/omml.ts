import { RenderError } from "../../core/index";
import {
  controlProperties,
  FORMAT,
  insertChild,
  type NodeOf,
  type RenderContext,
  renderChild,
  requireElement,
  requireNodeList,
  wordRunProperties,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderUnaryFunction(
  node: NodeOf<"unaryFunction">,
  context: RenderContext,
): XmlElement {
  switch (node.name) {
    case "UnaryFunction":
      return renderUnaryCarrier(node, context);
    case "Tr":
      return renderTr(node, context);
    default:
      throw new RenderError(
        `UnaryFunction alias "${node.name}" has not been measured for OMML in this slice`,
        FORMAT,
        node.kind,
      );
  }
}

function renderUnaryCarrier(node: NodeOf<"unaryFunction">, context: RenderContext): XmlElement {
  const funcPr = new XmlElement("m:funcPr").append(controlProperties());
  const functionName = new XmlElement("m:fName").append(
    new XmlElement("m:r").append(
      wordRunProperties(false),
      new XmlElement("m:t").append("unaryfunction"),
    ),
  );
  const argument = new XmlElement("m:e").append(
    insertChild(node.parameterOne, context, "unaryFunction.parameterOne"),
  );
  return new XmlElement("m:func").append(funcPr, functionName, argument);
}

/** Measured two-cell row shape used by the first Table slice. */
function renderTr(node: NodeOf<"unaryFunction">, context: RenderContext): XmlElement {
  const cells = requireNodeList(node.parameterOne, node.kind, "tr.parameterOne");
  if (cells.length < 2) {
    throw new RenderError(
      "tr.parameterOne: the single-cell branch is deferred until separately measured",
      FORMAT,
      node.kind,
    );
  }
  const row = new XmlElement("m:mr");
  cells.forEach((cell, index) => {
    row.append(
      requireElement(
        renderChild(cell, context, `tr.parameterOne[${index}]`),
        node.kind,
        `tr.parameterOne[${index}]`,
        "m:e",
      ),
    );
  });
  return row;
}
