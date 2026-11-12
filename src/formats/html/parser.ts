/**
 * The HTML format entry point (ARCHITECTURE.md §4):
 * normalise → grammar → JSON round trip → transform → an immutable
 * `FormulaNode`.
 *
 * The pipeline mirrors the gem's, and `html/parser.rb` is 36 lines that differ
 * from `latex/parser.rb` in three places worth naming:
 *
 *   - **Normalisation is scoped, not global.** `Html::Parser#normalized_text`
 *     (`html/parser.rb:27-33`) runs the decode/encode round trip over
 *     substrings matching `HTML_ENTITY` only, where `latex/parser.rb:27`
 *     encodes the whole text. It has to: encoding everything would turn `<`
 *     into `&#x3c;` and leave no tag to parse. See `./preprocess`.
 *   - **There is a JSON round trip.** `html/parser.rb:18` runs
 *     `JSON.parse(nodes.to_json, symbolize_names: true)` between the grammar
 *     and the transform, which flattens every `Parslet::Slice` to a plain
 *     String. Measured: `x<sub>1</sub>` leaves Parslet as
 *     `{sub_sup: {text: "x"@0}, sub_value: {number: "1"@6}}` and reaches the
 *     transform as `{sub_sup: {text: "x"}, sub_value: {number: "1"}}`.
 *     the shared consumer’s `plainTree` is that step, and it is why `./transform` has no Slice
 *     branch anywhere.
 *   - **The wrap is CONDITIONAL.** `html/parser.rb:20-22` returns the
 *     transform's own result when it is already a `Math::Formula` and wraps
 *     otherwise, where `Latex::Parser#parse` wraps unconditionally. So an HTML
 *     formula is one level shallower than a LaTeX one for the same shape.
 *
 * `Plurimath::Math.parse_formula` (`math.rb:62-66`) then sets `input_string`
 * to the CALLER's text, not the normalised form.
 *
 * Failure positions: `ParseFailed.index` is an offset into the NORMALISED
 * text, and a replaced entity almost never keeps its length, so every position
 * is mapped back through the `SourceMap` before it reaches a caller as
 * `ParseError.index` (§5).
 *
 * The gem lets `Parslet::ParseFailed` escape uncaught — there is no `rescue`
 * anywhere under `lib/plurimath/html/` — and `Plurimath::Math.parse` turns it,
 * and every other `StandardError`, into a `ParseError` at the public boundary
 * (`math.rb:45-49`). That is the boundary `normalize`, the grammar and the
 * transform stand at, so a refusal from ANY of those three is a `ParseError`
 * and nothing else escapes from them. It is NOT the boundary the function as
 * a whole stands at: `Math.parse` validates parse OPTIONS first, from its own
 * body (`math.rb:33-38`), before `parse_formula` ever runs — outside that
 * `begin`/`rescue StandardError` — so an unknown option key or an unsupported
 * `locale` value raises `ParseOptionError` or `UnsupportedLocaleError`
 * unwrapped, never a `ParseError`. See the shared consumer’s `validateOptions`.
 */

import { type FormulaNode, ParseError } from "../../core/index";
import { ParseFailed, type ParseValue, type SourceMap } from "../../pegkit/index";
import { type HtmlParseOptions, normalize, transformHtmlTree, validateOptions } from "./consumer";
import { htmlGrammar } from "./grammar";

export type { HtmlParseOptions } from "./consumer";

export function parseHtml(input: string, options?: HtmlParseOptions | null): FormulaNode {
  validateOptions(options);
  const { text, map } = normalize(input);
  return transformHtmlTree(parseNormalized(input, text, map, options), input);
}

function parseNormalized(
  input: string,
  text: string,
  map: SourceMap,
  options?: HtmlParseOptions | null,
): ParseValue {
  try {
    return htmlGrammar(options ?? undefined).root.parse(text);
  } catch (error) {
    if (error instanceof ParseFailed) {
      throw new ParseError(error.message, input, "html", map.toOriginal(error.index));
    }
    throw error;
  }
}
