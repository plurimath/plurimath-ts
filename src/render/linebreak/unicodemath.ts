/**
 * Mirrors `function/linebreak.rb` — `Linebreak#to_unicodemath` (:87).
 *
 * The newline is emitted as the entity `&#xa;`, not as a literal newline. That
 * matters: `Formula#to_unicodemath` also collapses `" / "` to `"/"` with a
 * regex whose `\s` would match a literal newline, so decoding early could
 * change a later match.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { renderOptionalChild } from "../../formats/unicodemath/render-shared";

const NEWLINE_ENTITY = "&#xa;";

export function renderLinebreak(node: NodeOf<"linebreak">, context: RenderContext): string {
  const inner = renderOptionalChild(node.parameterOne, context);
  return `${NEWLINE_ENTITY}${inner}`;
}
