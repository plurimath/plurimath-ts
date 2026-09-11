/**
 * Mirrors `function/text.rb` — `Text#to_unicodemath` (:45).
 *
 * Three things differ from every other unary kind, all kept:
 *
 *   - it reads the node's own text rather than rendering a child. The gem
 *     calls that field `value`; this port carries it as `parameterOne`, and
 *     holds a raw string there rather than a node (see `render/text/latex.ts`,
 *     which makes the same reading);
 *   - it returns **nil** when the text is falsy, rather than an empty string.
 *     Falsy by RUBY truthiness: the gem opens `return unless value`, which is
 *     not `unless value.nil?`, so `false` answers nil exactly as nil does
 *     (measured on the pinned oracle 00c52783 —
 *     `Text.new(false).to_unicodemath` is nil and
 *     `Formula([Text.new(false)]).to_unicodemath` is `""`). `NodeParameter`
 *     cannot hold `false`, but §5's structural dispatch admits an object that
 *     does, and refusing it here is the divergence this once shipped;
 *   - it decodes entities *here* rather than leaving them to the formula
 *     boundary, and quotes the result — unless the text starts with a
 *     backslash, which passes through raw and unquoted.
 */

import { RenderError } from "../../core/index";
import {
  FORMAT,
  htmlEntityToUnicode,
  type NodeOf,
  present,
} from "../../formats/unicodemath/render-shared";

export function renderText(node: NodeOf<"text">): string | null {
  const text = node.parameterOne;
  // `return unless value` — Ruby truthiness, so nil and `false` answer alike.
  if (!present(text)) return null;
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
