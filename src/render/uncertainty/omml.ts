/**
 * `Uncertainty#to_omml_without_math_tag` (`function/uncertainty.rb`,
 * plurimath#493): one `m:box` whose first child is a hidden zero-size phantom
 * carrying the marker, followed by the visible form.
 */
import { RenderError } from "../../core/index";
import {
  UNCERTAINTY_PLUS_MINUS,
  uncertaintyMarker,
  uncertaintyProblem,
  uncertaintyStandardParenthesised,
  uncertaintyStatements,
  uncertaintyText,
} from "../../core/uncertainty";
import {
  FORMAT,
  type NodeOf,
  type OmmlRendered,
  plainRun,
  type RenderContext,
  styledRun,
} from "../../formats/omml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderUncertainty(node: NodeOf<"uncertainty">, context: RenderContext): XmlElement {
  const problem = uncertaintyProblem(node);
  if (problem !== null) throw new RenderError(problem, FORMAT, node.kind);
  const value = uncertaintyText(node.value) ?? "";
  const nodes: OmmlRendered[] = [marker(uncertaintyMarker(node))];
  switch (node.category) {
    case "standard":
      nodes.push(
        plainRun(value),
        fence("(", ")", [plainRun(uncertaintyStandardParenthesised(node))]),
      );
      break;
    case "expanded":
      nodes.push(
        fence("(", ")", [
          plainRun(value),
          plainRun(UNCERTAINTY_PLUS_MINUS),
          plainRun(uncertaintyText(node.magnitude) ?? ""),
        ]),
      );
      break;
    default:
      nodes.push(
        plainRun(value),
        plainRun(","),
        fence("[", "]", [
          plainRun(uncertaintyText(node.lower) ?? ""),
          plainRun(","),
          plainRun(uncertaintyText(node.upper) ?? ""),
        ]),
      );
  }
  if (node.unit !== null) nodes.push(box([context.insert(node.unit)]));
  for (const [name, number] of uncertaintyStatements(node)) {
    nodes.push(plainRun(","), plainRun(name), plainRun("="), plainRun(number));
  }
  return box(nodes);
}

function box(nodes: readonly OmmlRendered[]): XmlElement {
  return new XmlElement("m:box").append(new XmlElement("m:e").append(nodes));
}

function fence(open: string, close: string, nodes: readonly XmlElement[]): XmlElement {
  const properties = new XmlElement("m:dPr").append(
    new XmlElement("m:begChr").setAttribute("m:val", open),
    new XmlElement("m:sepChr").setAttribute("m:val", ""),
    new XmlElement("m:endChr").setAttribute("m:val", close),
  );
  return new XmlElement("m:d").append(properties, new XmlElement("m:e").append(nodes));
}

/** `omml_marker`: the marker as an upright run inside a hidden, zero-size phantom. */
function marker(text: string): XmlElement {
  const properties = new XmlElement("m:phantPr").append(
    new XmlElement("m:show").setAttribute("m:val", "off"),
    new XmlElement("m:zeroWid").setAttribute("m:val", "on"),
    new XmlElement("m:zeroAsc").setAttribute("m:val", "on"),
    new XmlElement("m:zeroDesc").setAttribute("m:val", "on"),
  );
  return new XmlElement("m:phant").append(
    properties,
    new XmlElement("m:e").append(styledRun(text)),
  );
}
