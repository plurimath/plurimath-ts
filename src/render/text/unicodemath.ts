/**
 * Mirrors `function/text.rb` — `Text#to_unicodemath` (:45).
 *
 * Three things differ from every other unary kind, all kept:
 *
 *   - it reads the node's own text rather than rendering a child. The gem
 *     calls that field `value`; this port carries it as `parameterOne`, and
 *     holds a raw string there rather than a node (see `render/text/latex.ts`,
 *     which makes the same reading);
 *   - it returns **nil** when the text is nil, rather than an empty string;
 *   - it decodes entities *here* rather than leaving them to the formula
 *     boundary, and quotes the result — unless the text starts with a
 *     backslash, which passes through raw and unquoted.
 */

import { RenderError } from "../../core/index";
import { FORMAT, htmlEntityToUnicode, type NodeOf } from "../../formats/unicodemath/render-shared";

export function renderText(node: NodeOf<"text">): string | null {
  const text = node.parameterOne;
  if (text === null || text === undefined) return null;
  if (typeof text !== "string") {
    throw new RenderError(
      `text.parameterOne: holds ${typeof text} — the gem raises NoMethodError here`,
      FORMAT,
      "text",
    );
  }
  if (text.startsWith("\\")) return text;

  return `"${htmlEntityToUnicode(text)}"`;
}
