/**
 * Mirrors `function/linebreak.rb` — `Linebreak#to_asciimath` (:21): the
 * `"\\\n "` break alone for an empty node; with a value, the break sits
 * before or after it depending on `attributes[:linebreakstyle]` — a send the
 * gem makes unguarded, so only a hash renders. Everything else raises there
 * (probe probe-linebreak-attributes.rb on the pinned oracle: TypeError for a
 * list, string, or integer; NoMethodError for nil, booleans, floats, and
 * nodes) and is `RenderError` here — never the silent before-form a bare
 * `.linebreakstyle` read would produce.
 */

import { RenderError } from "../../core/index";
import {
  describeSlot,
  FORMAT,
  type NodeOf,
  present,
  type RenderContext,
  slotKind,
} from "../../formats/asciimath/render-shared";
import { asciimathValue } from "../unary-function/asciimath";

export function renderLinebreak(node: NodeOf<"linebreak">, context: RenderContext): string {
  const lineBreak = "\\\n ";
  if (!present(node.parameterOne)) return lineBreak;
  const attributes = node.attributes;
  const isHash =
    typeof attributes === "object" &&
    attributes !== null &&
    !Array.isArray(attributes) &&
    slotKind(attributes) === undefined;
  if (!isHash) {
    throw new RenderError(
      `linebreak.attributes: holds ${describeSlot(attributes)} — the gem sends ` +
        "attributes[:linebreakstyle], which only a hash answers (TypeError or " +
        "NoMethodError there, by class)",
      FORMAT,
      node.kind,
    );
  }
  const value = asciimathValue(node.parameterOne, context, "linebreak.parameterOne");
  if (attributes.linebreakstyle === "after") return `${value}${lineBreak}`;
  return `${lineBreak}${value}`;
}
