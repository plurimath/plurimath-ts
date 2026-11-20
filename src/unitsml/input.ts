/** Standalone Math.parse(:unitsml), including Ruby 142bc513's Formula wrapper. */
import { FormulaNode, UnitsmlNode } from "../core/index";
import { validateUnitsml } from "./parser";

export function parseUnitsml(input: string): FormulaNode {
  validateUnitsml(input);
  // Keep the caller's text, including unitsml(...) and extra options. Expansion
  // stays at render time so per-call unit options remain effective.
  return new FormulaNode({
    value: [new UnitsmlNode({ text: input })],
    inputString: input,
  });
}
