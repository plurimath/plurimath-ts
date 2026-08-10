/**
 * Mirrors `formula.rb` — `Formula#to_latex` (:141):
 * `value.map { to_latex }.join(" ")` — strict per element, which is where
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
  unreachableName,
} from "../../formats/latex/render-shared";

/**
 * The class names this carrier has measured behaviour for — the one class the
 * census folds onto `Formula` (`corpus/census.yaml`: `Mstyle`, disposition
 * `aliased`). The AsciiMath transform never constructs a formula subclass, so
 * like the table carrier's set this one is not derivable from the transform
 * registry; it is hand-listed, and pinned by a behavioural render in
 * `test/formats/latex/renderer.spec.ts` (probe-latex-name-guards.rb on the
 * pinned oracle, 2026-08-10: `Mstyle#to_latex`'s owner is `Math::Formula` —
 * no override — so it renders byte-identically to the bare carrier, and
 * Formula's subclass list is exactly `["Mstyle"]`). A defined name outside
 * the set raises rather than rendering the carrier default, because the
 * class it would denote has no measured render here
 * (`unreachableName` in `../../formats/latex/render-shared.ts`).
 */
const MEASURED_FORMULA_NAMES: ReadonlySet<string> = new Set(["Mstyle"]);

export function renderFormula(node: NodeOf<"formula">, context: RenderContext): string {
  if (node.name !== undefined && !MEASURED_FORMULA_NAMES.has(node.name))
    throw unreachableName(node.kind, node.name);
  return renderFormulaValue(node.value, context, "formula");
}

/**
 * The join itself, exported for the kind file of the one `Formula` subclass
 * the union carries (`../mrow/latex.ts`, which inherits `to_latex` unchanged).
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
