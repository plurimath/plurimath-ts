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
 *     `plainTree` below is that step, and it is why `./transform` has no Slice
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
 * (`math.rb:44-48`). That is the boundary this function stands at, so a
 * refusal is a `ParseError` and nothing else escapes.
 */

import { describeThrown } from "../../core/errors";
import { type FormulaNode, type OnUnsupported, ParseError } from "../../core/index";
import type { LocaleOptions } from "../../formatting/index";
import { ParseFailed, type ParseValue, Slice, type SourceMap } from "../../pegkit/index";
import { htmlGrammar } from "./grammar";
import { preprocess } from "./preprocess";
import { finalizeHtmlParse, htmlTransform } from "./transform";

/**
 * Locale (the decimal marker the grammar reads at parse time) plus the
 * deferred-construct hook §5 promises on every parser.
 *
 * `onUnsupported` is accepted and never fired: `html/parse.rb` has no
 * commented-out alternative and no construct this port declines, unlike
 * AsciiMath's UnitsML branch. It is in the signature so the shape matches the
 * other parsers rather than to describe a behaviour that exists.
 */
export interface HtmlParseOptions extends LocaleOptions {
  readonly onUnsupported?: OnUnsupported;
}

/**
 * `JSON.parse(nodes.to_json, symbolize_names: true)` (`html/parser.rb:18`)
 * over a Parslet tree, whose leaves are slices, hashes, arrays and nil.
 *
 * `Parslet::Slice` has no `to_json` of its own, so the JSON library falls back
 * to `to_s` — measured: `Parse.new.parse("x").to_json` is `{"text":"x"}` and
 * the reparsed tree carries the String `"x"`. Hash keys survive as the same
 * symbols, and `nil` survives as `nil`, so nothing else about the tree moves.
 */
function plainTree(value: ParseValue): unknown {
  if (value instanceof Slice) return value.text;
  if (Array.isArray(value)) return value.map(plainTree);
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) result[key] = plainTree(entry);
    return result;
  }
  return value;
}

/**
 * `Plurimath::Math.parse(input, :html)`'s observable result.
 *
 * All three stages are wrapped, because `Plurimath::Math.parse` wraps
 * everything (`math.rb:44-48`):
 *
 * ```ruby
 * rescue ParseError
 *   raise
 * rescue StandardError
 *   raise ParseError.new(text, type), cause: nil
 * ```
 *
 * That is not theoretical for any of the three. NORMALISATION raises: measured,
 * `&#55296;` decodes to a lone surrogate and the gem raises
 * `RangeError: invalid codepoint 0xD800 in UTF-8`, which is a `StandardError`
 * and so reaches a caller as `ParseError`. The GRAMMAR raises `ParseFailed`,
 * which is mapped with a position. And the TRANSFORM raises on a node shape
 * whose rule family the gem does not carry either.
 *
 * A normalisation or transform failure is attributed to offset 0: unlike a
 * grammar failure it carries no position, and the gem's own `ParseError` for
 * these has none either.
 */
export function parseHtml(input: string, options?: HtmlParseOptions | null): FormulaNode {
  const { text, map } = normalize(input);
  const tree = parseNormalized(input, text, map, options);
  try {
    const transformed = htmlTransform().apply(plainTree(tree));
    return finalizeHtmlParse(transformed, input);
  } catch (error) {
    throw asParseError(error, input);
  }
}

function normalize(input: string): { text: string; map: SourceMap } {
  try {
    return preprocess(input);
  } catch (error) {
    throw asParseError(error, input);
  }
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

function asParseError(error: unknown, input: string): ParseError {
  if (error instanceof ParseError) return error;
  return new ParseError(
    error instanceof Error ? error.message : describeThrown(error),
    input,
    "html",
    0,
  );
}
