/**
 * Mirrors `function/text.rb` — `Text#to_latex` (:30):
 * `"\\text{#{parse_text('latex') || parameter_one}}"` — for latex,
 * `parse_text` only unwraps `unicode[:name]` tokens to their names. Nil
 * interpolates to nothing; anything but a string dies in `gsub`.
 */

import { RenderError } from "../../../core/index";
import { describeSlot, FORMAT, type NodeOf } from "./shared";

export function renderText(node: NodeOf<"text">): string {
  const parameterOne = node.parameterOne;
  if (parameterOne === null || parameterOne === undefined) return "\\text{}";
  if (typeof parameterOne !== "string") {
    throw new RenderError(
      `text.parameterOne: holds ${describeSlot(parameterOne)} — the gem raises NoMethodError here`,
      FORMAT,
      "text",
    );
  }
  return `\\text{${parameterOne.replace(/unicode\[:(\w+)\]/g, "$1")}}`;
}
