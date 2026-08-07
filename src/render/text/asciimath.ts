/**
 * Mirrors `function/text.rb` — `Text#to_asciimath` (:19):
 * `"\"#{parse_text('asciimath') || parameter_one}\""` — for asciimath,
 * `parse_text` only unwraps `unicode[:name]` tokens to their names. Nil
 * interpolates to nothing; anything but a string dies in `gsub`.
 */

import { RenderError } from "../../core/index";
import { describeSlot, FORMAT, type NodeOf } from "../../formats/asciimath/render-shared";

export function renderText(node: NodeOf<"text">): string {
  const parameterOne = node.parameterOne;
  if (parameterOne === null || parameterOne === undefined) return '""';
  if (typeof parameterOne !== "string") {
    throw new RenderError(
      `text.parameterOne: holds ${describeSlot(parameterOne)} — the gem raises NoMethodError here`,
      FORMAT,
      "text",
    );
  }
  return `"${parameterOne.replace(/unicode\[:(\w+)\]/g, "$1")}"`;
}
