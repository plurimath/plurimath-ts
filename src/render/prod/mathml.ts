/**
 * Mirrors `function/prod.rb` — `Prod#to_mathml_without_math_tag` (:13): the
 * body `function/sum.rb` repeats verbatim (see `../sum/mathml.ts`), head
 * `<mo>&#x220f;</mo>` (probes prod-bare / prod-all).
 */

import type { NodeOf, RenderContext } from "../../formats/mathml/render-shared";
import type { XmlElement } from "../../xml/index";
import { renderBigUnderover } from "../sum/mathml";

export function renderProd(node: NodeOf<"prod">, context: RenderContext): XmlElement {
  return renderBigUnderover(node, context, "prod");
}
