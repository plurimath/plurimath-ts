/**
 * `Uncertainty#to_unicodemath` (`function/uncertainty.rb`, plurimath#493): the
 * visible form wrapped in the intent form `ⓘ("marker"…)`, which the
 * UnicodeMath reader takes back. A unit is written `ⓐ(unit …)`.
 */
import { RenderError } from "../../core/index";
import {
  uncertaintyMarker,
  uncertaintyProblem,
  uncertaintyStandardParenthesised,
  uncertaintyStatements,
  uncertaintyText,
} from "../../core/uncertainty";
import { FORMAT, type NodeOf, type RenderContext } from "../../formats/unicodemath/render-shared";

export function renderUncertainty(node: NodeOf<"uncertainty">, context: RenderContext): string {
  const problem = uncertaintyProblem(node);
  if (problem !== null) throw new RenderError(problem, FORMAT, node.kind);
  const unit = node.unit === null ? "" : `ⓐ(unit ${context.render(node.unit) ?? ""})`;
  const value = uncertaintyText(node.value) ?? "";
  // The reader cannot take `"marker"-…`, so a negative leading value goes in
  // an invisible 〖〗 group; the marker is unchanged.
  const leading = value.startsWith("-") ? `〖${value}〗` : value;
  const statements = uncertaintyStatements(node)
    .map(([name, number]) => `, ${name}=${number}`)
    .join("");
  let visible: string;
  switch (node.category) {
    case "standard":
      visible = `${leading}(${uncertaintyStandardParenthesised(node)})${unit}`;
      break;
    case "expanded":
      visible = `(${value}±${uncertaintyText(node.magnitude) ?? ""})${unit}${statements}`;
      break;
    default: {
      const lower = uncertaintyText(node.lower) ?? "";
      const upper = uncertaintyText(node.upper) ?? "";
      visible = `${leading}, [${lower}, ${upper}]${unit}${statements}`;
    }
  }
  return `ⓘ("${uncertaintyMarker(node)}"${visible})`;
}
