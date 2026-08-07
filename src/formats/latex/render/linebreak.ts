/**
 * Mirrors `function/linebreak.rb` — `Linebreak#to_latex` (:33): the `"\\ "`
 * break alone for an empty node; with a value, the break sits before or
 * after it depending on `attributes[:linebreakstyle]` — which the gem reads
 * unguarded, so missing attributes raise `NoMethodError` there and
 * `RenderError` here. The value goes through the inherited `latex_value`
 * (`unary_function.rb:221`, `./unary-function.ts`).
 */

import { RenderError } from "../../../core/index";
import { FORMAT, type NodeOf, present, type RenderContext, s } from "./shared";
import { latexValue } from "./unary-function";

export function renderLinebreak(node: NodeOf<"linebreak">, context: RenderContext): string {
  const lineBreak = "\\\\ ";
  if (!present(node.parameterOne)) return lineBreak;
  const attributes = node.attributes;
  if (attributes === null || attributes === undefined) {
    throw new RenderError(
      "linebreak.attributes: missing — the gem reads attributes[:linebreakstyle] and raises NoMethodError on nil",
      FORMAT,
      node.kind,
    );
  }
  const value = s(latexValue(node.parameterOne, context, "linebreak.parameterOne"));
  if (attributes.linebreakstyle === "after") return `${value}${lineBreak}`;
  return `${lineBreak}${value}`;
}
