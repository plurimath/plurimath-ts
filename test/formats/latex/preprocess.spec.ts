/**
 * `Latex::Parser#pre_processing` (`latex/parser.rb:25-40`), checked against the
 * gem — and in particular its last line, the restoration pass:
 *
 * ```ruby
 * text.gsub(TEXT_REGEX) { |_str| text_functions.shift }
 * ```
 *
 * `text_functions` was scanned off the RAW input, but the pass runs over text
 * that decoding, encoding and five `gsub`es have already rewritten, so the two
 * counts disagree whenever a pass creates or destroys a `\text{...}` match:
 *
 *   - `"\\text {x}"` loses its space and BECOMES a match nothing saved;
 *   - `"\\text&#x7b;x&#x7d;"` gains its braces from the decode and does the same;
 *   - `"\\text{ }"` loses its body and stops being one, leaving a saved entry
 *     with nowhere to go.
 *
 * Ruby does not guard either direction. `Array#shift` on an exhausted array
 * returns nil and `String#gsub`'s block form stringifies what the block returns
 * (`nil.to_s` is `""`), so a surplus match is DELETED; a surplus saved entry is
 * simply never read. The port reproduced neither until this suite landed — it
 * threw instead, refusing four inputs of which the gem renders two.
 *
 * Nothing here is reasoned out. Every expectation below is the oracle's own
 * answer at plurimath `00c52783877b38f6b8e6e109f1803f96bb34fc62`, Ruby 4.0.1,
 * read off `Plurimath::Latex::Parser.new(input).text` and
 * `Plurimath::Math.parse(input, :latex).to_asciimath`. Two of them look like
 * gem bugs and are still copied verbatim: `"\\text {a}\\text{b}"` restores the
 * saved `\text{b}` into the FIRST match's position and deletes the second, and
 * `"\\sqrt{\\text {x}}"` renders as `sqrt` with no radicand at all.
 */

import { describe, expect, it } from "vitest";
import { ParseError } from "../../../src/core/index";
import { toAsciimath } from "../../../src/formats/asciimath/index";
import { parseLatex } from "../../../src/formats/latex/parser";
import { preprocess } from "../../../src/formats/latex/preprocess";

/**
 * `[input, Plurimath::Latex::Parser.new(input).text, to_asciimath]` for inputs
 * the gem preprocesses AND parses. The AsciiMath column is here because the
 * preprocessed text alone would not catch a restoration that produced the right
 * string for the wrong reason.
 */
const RENDERED: readonly (readonly [input: string, preprocessed: string, asciimath: string])[] = [
  // Restoration deletes a surplus match — the four-case gap this suite closes.
  ["x\\text {y}", "x", "x"],
  ["\\text&#x7b;x&#x7d;+1", "+1", "+ 1"],
  ["\\text&#x7b;a b&#x7d;+1", "+1", "+ 1"],
  ["\\text&#123;x&#125;+1", "+1", "+ 1"],
  ["\\text {x}^2", "^2", "^ 2"],
  ["x+\\text {y}", "x+", "x +"],
  ["a\\text {b}c\\text {d}e", "ace", "a c e"],
  ["\\sqrt{\\text {x}}", "\\sqrt{}", "sqrt"],
  ["\\mbox {x}+1", "+1", "+ 1"],
  ["\\text\n{x}+1", "+1", "+ 1"],
  ["&#x5c;text{a}+1", "+1", "+ 1"],
  // Both counts non-zero, so `shift` pairs saved entries with match POSITIONS
  // rather than with the matches they came from.
  ["\\text{a}\\text {b}", "\\text{a}", '"a"'],
  ["\\text {a}\\text{b}", "\\text{b}", '"b"'],
  ["\\text{x}\\text {y}\\text{z}", "\\text{x}\\text{z}", '"x" "z"'],
  // The other direction: more saved than restored, and the leftovers are
  // silently dropped.
  ["\\text{ }", "\\text{}", '""'],
  ["\\text{&#xa;}", "\\text{}", '""'],
  ["\\text{ }x", "\\text{}x", '"" x'],
  // Controls: the counts agree, and nothing above may disturb these.
  ["\\text{x}", "\\text{x}", '"x"'],
  ["x+\\text{y}", "x+\\text{y}", 'x + "y"'],
  ["\\text{a b}", "\\text{a b}", '"a b"'],
];

/**
 * The same, for inputs whose AsciiMath rendering this port declines for an
 * unrelated reason: `toAsciimath` refuses the `Mbox` carrier outright ("not
 * reachable from the AsciiMath transform"), where the gem renders `\mbox{ab}`
 * as `"ab"` and `\mbox{}` as `""` (measured). That divergence is the AsciiMath
 * renderer's, not this pass's, so only the preprocessing is asserted here —
 * `\mbox` still has to reach the restoration pass to be dropped or kept.
 */
const PREPROCESS_ONLY: readonly (readonly [input: string, preprocessed: string])[] = [
  ["\\mbox{ }", "\\mbox{}"],
  ["\\mbox{ab}", "\\mbox{ab}"],
];

/**
 * `[input, preprocessed]` for inputs the gem preprocesses and then REFUSES:
 * `Plurimath::Math.parse` raises `Math::ParseError`. The empty strings are the
 * restoration deleting the whole formula.
 */
const REFUSED: readonly (readonly [input: string, preprocessed: string])[] = [
  ["\\text {x}", ""],
  ["\\mbox {x}", ""],
  ["\\text\n{x}", ""],
  ["\\text  {x}", ""],
  ["&#x5c;text{a}", ""],
  ["\\text&#x7b;x&#x7d;", ""],
  ["\\text {\\alpha}", ""],
  // A tab is not the space `gsub(/((?<!\\) )|\n+/, "")` strips: it is outside
  // printable ASCII, so the encoder turns it into `&#x9;` and it stays. No
  // match is created, nothing is deleted, and the grammar refuses what is left.
  ["\\text\t{x}", "\\text&#x9;{x}"],
];

describe("latex preprocessing: the restoration pass", () => {
  it.each([...RENDERED.map(([input, pre]) => [input, pre] as const), ...PREPROCESS_ONLY])(
    "%j preprocesses to %j",
    (input, preprocessed) => {
      expect(preprocess(input).text).toBe(preprocessed);
    },
  );

  it.each(RENDERED)(
    "%j preprocesses to %j and renders as %j",
    (input, _preprocessed, asciimath) => {
      expect(toAsciimath(parseLatex(input))).toBe(asciimath);
    },
  );

  it.each(REFUSED)("%j preprocesses to %j and is then refused", (input, preprocessed) => {
    expect(preprocess(input).text).toBe(preprocessed);
    expect(() => parseLatex(input)).toThrow(ParseError);
  });
});
