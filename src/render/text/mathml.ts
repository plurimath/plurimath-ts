/**
 * Mirrors `function/text.rb` — `Text#to_mathml_without_math_tag` (:23):
 * a nil parameter is the SELF-CLOSING `<mtext/>` (early return, no text
 * child — probe text-nil), anything else `<mtext>` over
 * `parse_text("mathml")`: every `unicode[:name]` token (`\w+` names only —
 * `unicode[:|]` stays literal, probed) replaced through
 * `UNICODE_SYMBOLS.invert` then `SYMBOLS.invert` (`symbol_value`,
 * text.rb:126-129), a miss replaced by the empty string. An empty string
 * parameter keeps the long form `<mtext></mtext>`. A non-string parameter
 * dies in the gem's gsub and raises here.
 */

import { RenderError } from "../../core/index";
import { describeSlot, FORMAT, type NodeOf, present } from "../../formats/mathml/render-shared";
import { MATHML_SYMBOLS_INVERT, MATHML_UNICODE_INVERT } from "../../generated/mathml/render-tables";
import { XmlElement } from "../../xml/index";

/** `Text::PARSER_REGEX` (`text.rb:7`): `unicode\[:(?<unicode>\w{1,})\]`. */
const UNICODE_TOKEN = /unicode\[:(\w+)\]/g;

export function renderText(node: NodeOf<"text">): XmlElement {
  const text = new XmlElement("mtext");
  const parameterOne = node.parameterOne;
  // `return text unless parameter_one` — Ruby truthiness, so false answers
  // the bare element exactly like nil.
  if (!present(parameterOne)) return text;
  if (typeof parameterOne !== "string") {
    throw new RenderError(
      `text.parameterOne: holds ${describeSlot(parameterOne)} — the gem raises NoMethodError here`,
      FORMAT,
      node.kind,
    );
  }
  const replaced = parameterOne.replace(
    UNICODE_TOKEN,
    (_token, name: string) =>
      MATHML_UNICODE_INVERT.get(name) ?? MATHML_SYMBOLS_INVERT.get(name) ?? "",
  );
  return text.append(replaced);
}
