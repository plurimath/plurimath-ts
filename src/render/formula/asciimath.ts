/**
 * Mirrors `formula.rb` — `Formula#to_asciimath` (:66):
 * `value.map { to_asciimath }.join(" ")` — strict per element, which is where
 * the gem's own `left(right)` parse fails to render (its value holds a bare
 * `""`).
 */

import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  type RenderContext,
  renderChild,
  s,
} from "../../formats/asciimath/render-shared";

export function renderFormula(node: NodeOf<"formula">, context: RenderContext): string {
  return renderFormulaValue(node.value, context, "formula");
}

/**
 * The join itself, exported for the kind file of the one `Formula` subclass
 * the union carries (`../mrow/asciimath.ts`, which inherits `to_asciimath` unchanged).
 */
export function renderFormulaValue(value: unknown, context: RenderContext, at: string): string {
  if (!Array.isArray(value)) {
    throw new RenderError(
      `${at}.value: is ${describeSlot(value)}, not a list — the gem raises NoMethodError here`,
      FORMAT,
      at,
    );
  }
  return value.map((item) => s(renderChild(item, context, `${at}.value`))).join(" ");
}
