/**
 * `Uncertainty#to_mathml_without_math_tag` (`function/uncertainty.rb`,
 * plurimath#493): one `<mrow intent="marker">` holding the visible form. The
 * marker is the authoritative reading; the visible content is regenerated.
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
import { FORMAT, type NodeOf, type RenderContext } from "../../formats/mathml/render-shared";
import { XmlElement } from "../../xml/index";

export function renderUncertainty(node: NodeOf<"uncertainty">, context: RenderContext): XmlElement {
  const problem = uncertaintyProblem(node);
  if (problem !== null) throw new RenderError(problem, FORMAT, node.kind);
  const value = uncertaintyText(node.value) ?? "";
  let nodes: XmlElement[];
  switch (node.category) {
    case "standard":
      nodes = [mn(value), fence("(", ")", [mn(uncertaintyStandardParenthesised(node))])];
      break;
    case "expanded":
      nodes = [
        fence("(", ")", [
          mn(value),
          mo(UNCERTAINTY_PLUS_MINUS),
          mn(uncertaintyText(node.magnitude) ?? ""),
        ]),
      ];
      break;
    default:
      nodes = [
        mn(value),
        mo(","),
        fence("[", "]", [
          mn(uncertaintyText(node.lower) ?? ""),
          mo(","),
          mn(uncertaintyText(node.upper) ?? ""),
        ]),
      ];
  }
  if (node.unit !== null) nodes.push(unitElement(node.unit, context));
  for (const [name, number] of uncertaintyStatements(node)) {
    nodes.push(mo(","), new XmlElement("mi").append(name), mo("="), mn(number));
  }
  return new XmlElement("mrow").setAttribute("intent", uncertaintyMarker(node)).append(nodes);
}

function mn(text: string): XmlElement {
  return new XmlElement("mn").append(text);
}

function mo(text: string): XmlElement {
  return new XmlElement("mo").append(text);
}

function fence(open: string, close: string, nodes: readonly XmlElement[]): XmlElement {
  return new XmlElement("mrow").append(mo(open), nodes, mo(close));
}

/**
 * `mathml_unit`: UnitsML marks its MathML with `unitsml`, so the formula's
 * post-processing puts the usual unit space in front of it; a unit read from
 * markup is marked the same way, and the unit carries `arg="unit"`.
 */
function unitElement(unit: NodeOf<"uncertainty">["value"], context: RenderContext): XmlElement {
  const rendered = context.render(unit);
  const mrow =
    rendered instanceof XmlElement && rendered.name === "mrow"
      ? rendered
      : new XmlElement("mrow").append(rendered);
  if (!mrow.attributes.has("unitsml")) mrow.setAttribute("unitsml", "true");
  mrow.setAttribute("arg", "unit");
  return mrow;
}
