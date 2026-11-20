/**
 * The HTML format entry point (ARCHITECTURE.md §4):
 * normalise → PARG artifact → JSON round trip → transform → an immutable
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
 * Failure positions: the PARG runtime reports UTF-8 byte offsets into NORMALISED
 * text. The initialized consumer converts them to UTF-16 and maps each position
 * back through the `SourceMap` before it reaches a caller as
 * `ParseError.index` (§5).
 *
 * Syntax, normalization and model refusals become `ParseError`. Runtime or
 * resource failures propagate unchanged, as on the caller-initialized entry;
 * a failed artifact is never retried through a handwritten grammar.
 * `Math.parse` validates parse OPTIONS first, from its own
 * body (`math.rb:33-38`), before `parse_formula` ever runs — outside that
 * `begin`/`rescue StandardError` — so an unknown option key or an unsupported
 * `locale` value raises `ParseOptionError` or `UnsupportedLocaleError`
 * unwrapped, never a `ParseError`. See the shared consumer’s `validateOptions`.
 */

import { createHtmlParser } from "./parsanol";
import { htmlRuntime } from "./stage";

export type { HtmlParseOptions } from "./consumer";

/** The initialized consumer owns preprocessing, source maps and model mapping. */
export const parseHtml = createHtmlParser(htmlRuntime);
