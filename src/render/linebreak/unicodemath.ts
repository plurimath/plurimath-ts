/**
 * Mirrors `function/linebreak.rb` — `Linebreak#to_unicodemath` (:87).
 *
 * The newline is emitted as the entity `&#xa;`, not as a literal newline. That
 * matters: `Formula#to_unicodemath` also collapses `" / "` to `"/"` with a
 * regex whose `\s` would match a literal newline, so decoding early could
 * change a later match.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { renderTruthyChild } from "../../formats/unicodemath/render-shared";

const NEWLINE_ENTITY = "&#xa;";

export function renderLinebreak(node: NodeOf<"linebreak">, context: RenderContext): string {
  // A bare `if parameter_one` guard: measured, `Linebreak.new(false)` renders
  // "&#xa;" rather than raising.
  const inner = renderTruthyChild(node.parameterOne, context, "linebreak.parameterOne");
  return `${NEWLINE_ENTITY}${inner}`;
}
