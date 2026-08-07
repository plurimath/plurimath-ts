/**
 * Mirrors `formula.rb` — `Formula#to_latex` (:141):
 * `value.map { to_latex }.join(" ")` — strict per element, which is where
 * the gem's own `left(right)` parse fails to render (its value holds a bare
 * `""`).
 */

import { RenderError } from "../../../core/index";
import { describeSlot, FORMAT, type NodeOf, type RenderContext, renderChild, s } from "./shared";

export function renderFormula(node: NodeOf<"formula">, context: RenderContext): string {
  return renderFormulaValue(node.value, context, "formula");
}

/**
 * The join itself, exported for the kind file of the one `Formula` subclass
 * the union carries (`./mrow.ts`, which inherits `to_latex` unchanged).
 */
export function renderFormulaValue(value: unknown, context: RenderContext, at: string): string {
  if (!Array.isArray(value)) {
    throw new RenderError(
      `${at}.value: is ${describeSlot(value)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      at,
    );
  }
  return value.map((item) => s(renderChild(item, context, at))).join(" ");
}
