/**
 * Mirrors `function/linebreak.rb` — `Linebreak#to_asciimath` (:21): the
 * `"\\\n "` break alone for an empty node; with a value, the break sits
 * before or after it depending on `attributes[:linebreakstyle]` — which the
 * gem reads unguarded, so missing attributes raise `NoMethodError` there and
 * `RenderError` here.
 */

import { RenderError } from "../../core/index";
import {
  FORMAT,
  type NodeOf,
  present,
  type RenderContext,
} from "../../formats/asciimath/render-shared";
import { asciimathValue } from "../unary-function/asciimath";

export function renderLinebreak(node: NodeOf<"linebreak">, context: RenderContext): string {
  const lineBreak = "\\\n ";
  if (!present(node.parameterOne)) return lineBreak;
  const attributes = node.attributes;
  if (attributes === null || attributes === undefined) {
    throw new RenderError(
      "linebreak.attributes: missing — the gem reads attributes[:linebreakstyle] and raises NoMethodError on nil",
      FORMAT,
      node.kind,
    );
  }
  const value = asciimathValue(node.parameterOne, context, "linebreak.parameterOne");
  if (attributes.linebreakstyle === "after") return `${value}${lineBreak}`;
  return `${lineBreak}${value}`;
}
