/** `Uncertainty#to_latex` (`function/uncertainty.rb`, plurimath#493). */
import { RenderError } from "../../core/index";
import {
  uncertaintyProblem,
  uncertaintyStandardParenthesised,
  uncertaintyStatements,
  uncertaintyText,
} from "../../core/uncertainty";
import { FORMAT, type NodeOf, type RenderContext } from "../../formats/latex/render-shared";

export function renderUncertainty(node: NodeOf<"uncertainty">, context: RenderContext): string {
  const problem = uncertaintyProblem(node);
  if (problem !== null) throw new RenderError(problem, FORMAT, node.kind);
  const unit = node.unit === null ? "" : ` ${context.render(node.unit) ?? ""}`;
  const value = uncertaintyText(node.value) ?? "";
  const statements = uncertaintyStatements(node)
    .map(([name, number]) => `,\\ ${name} = ${number}`)
    .join("");
  switch (node.category) {
    case "standard":
      return `${value}(${uncertaintyStandardParenthesised(node)})${unit}`;
    case "expanded":
      return `(${value} \\pm ${uncertaintyText(node.magnitude) ?? ""})${unit}${statements}`;
    default: {
      const lower = uncertaintyText(node.lower) ?? "";
      const upper = uncertaintyText(node.upper) ?? "";
      return `${value},\\ [${lower}, ${upper}]${unit}${statements}`;
    }
  }
}
