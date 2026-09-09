/**
 * `Latex::Parser#pre_processing` (`latex/parser.rb:25-40`), checked against the
 * gem — and in particular its last line, the restoration pass:
 *
 * ```ruby
 * text.gsub(TEXT_REGEX) { |_str| text_functions.shift }
 * ```
 *
 * `text_functions` was scanned off the RAW input, but the pass runs over text
 * that decoding, encoding and the six `gsub`es of `gsub_space_and_unicodes`
 * (`latex/parser.rb:32-40`, counted) have already rewritten, so the two counts
 * disagree whenever a pass creates or destroys a `\text{...}` match:
 *
 *   - `"\\text {x}"` loses its space and BECOMES a match nothing saved;
 *   - `"\\text&#x7b;x&#x7d;"` gains its braces from the decode and does the same;
 *   - `"\\text{ }"` loses its body and stops being one, leaving a saved entry
 *     with nowhere to go.
 *
 * Ruby does not guard either direction. `Array#shift` on an exhausted array
 * returns nil and `String#gsub`'s block form stringifies what the block returns
 * (`nil.to_s` is `""`), so a surplus MATCH is deleted; a surplus SAVED entry is
 * simply never read.
 *
 * Only the first of those two was broken here. A surplus saved entry needs no
 * code at all — the port already left `"\\text{ }"` as `\text{}` rendering `""`,
 * matching the gem, before this change and after it. A surplus match is what
 * the port refused: it threw rather than shift a nil, which cost it four inputs
 * of which the gem renders two.
 *
 * Nothing in the three tables below is reasoned out. Every one of their
 * expectations is the oracle's own answer at plurimath
 * `00c52783877b38f6b8e6e109f1803f96bb34fc62`, Ruby 4.0.1, read off
 * `Plurimath::Latex::Parser.new(input).text` and
 * `Plurimath::Math.parse(input, :latex).to_asciimath`. Two of them look like
 * gem bugs and are still copied verbatim: `"\\text {a}\\text{b}"` restores the
 * saved `\text{b}` into the FIRST match's position and deletes the second, and
 * `"\\sqrt{\\text {x}}"` renders as `sqrt` with no radicand at all.
 *
 * The FOURTH table is the exception and says so at its own docstring: the gem
 * carries no position for an undecodable character reference, so those eight
 * offsets are this port's choice, not the gem's answer.
 */

import { describe, expect, it } from "vitest";
import Plurimath from "../../../src/compat/index";
import { ParseError } from "../../../src/core/index";
import { UndecodableEntityError } from "../../../src/core/nodes";
import { toAsciimath } from "../../../src/formats/asciimath/index";
import { parseLatex, parseLatexTree } from "../../../src/formats/latex/parser";
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

/**
 * `[input, offset of the `&`]` for references the decoder cannot turn into a
 * character. The gem raises `RangeError` out of `pre_processing`, which
 * `Plurimath::Math.parse` rewraps as a `Math::ParseError` carrying `@text` and
 * `@type` and NO position (`errors/parse_error.rb:6-10`) — so the offsets below
 * have no oracle and are this port's own contract (`ParseError.index`,
 * ARCHITECTURE.md §5). They are the position of the reference, measured, rather
 * than the 0 a port with nothing to report would have to invent.
 */
const UNDECODABLE: readonly (readonly [input: string, index: number])[] = [
  ["&#x110000;", 0],
  ["x&#xd800;", 1],
  ["x+&#x110000;", 2],
  ["abc&#x110000;def", 3],
  ["\\frac{1}{2}+&#x110000;", 12],
  ["x+&#9999999;", 2],
  ["&#1114112;", 0],
  ["&#xffffff;", 0],
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

describe("latex preprocessing: undecodable character references", () => {
  it.each(UNDECODABLE)("%j reports the reference at %i", (input, index) => {
    let thrown: unknown;
    try {
      preprocess(input);
    } catch (error) {
      thrown = error;
    }
    // `thrown` stays `undefined` when nothing was raised, so the first
    // assertion still fails a non-throwing `preprocess` — the reason it is a
    // `RangeError` subclass being that the renderers which brand a bare
    // `RangeError` at their entry as a stack-depth refusal keep matching it.
    expect(thrown).toBeInstanceOf(RangeError);
    expect(thrown).toBeInstanceOf(UndecodableEntityError);
    expect((thrown as UndecodableEntityError).index).toBe(index);
  });
});

/**
 * `preprocessOrParseError` (`parser.ts`) is the only thing standing between
 * the raw `UndecodableEntityError` proven above and a caller of `parseLatex`,
 * `parseLatexTree`, or the compat constructor. Delete both of its call sites
 * and every one of those three still throws on this input -- `preprocess`
 * itself refuses it, per `UNDECODABLE` above -- but what they throw stops
 * being a `ParseError`: it surfaces as the bare `UndecodableEntityError`, with
 * no `code`, no `format`, and no `input` for a caller to read. A review did
 * exactly that and the rest of this suite, 30 compatibility assertions and 266
 * model-fixture checks, stayed green, which is what this block exists to
 * close.
 *
 * `"x+&#x110000;"` is `UNDECODABLE`'s own second entry, chosen because its raw
 * failure is already pinned by a different assertion above.
 */
describe("latex preprocessing: the undecodable-entity wrapper", () => {
  const input = "x+&#x110000;";

  it.each([
    ["parseLatex", () => parseLatex(input)],
    ["parseLatexTree", () => parseLatexTree(input)],
    ["the compat constructor", () => new Plurimath(input, "latex")],
  ] as const)("%s reports a ParseError naming the format and the original input", (_label, run) => {
    let thrown: unknown;
    try {
      run();
    } catch (error) {
      thrown = error;
    }
    // `thrown` stays `undefined` when nothing was raised, so the first
    // assertion still fails a call that does not throw at all.
    expect(thrown).toBeInstanceOf(ParseError);
    const error = thrown as ParseError;
    expect(error.format).toBe("latex");
    expect(error.input).toBe(input);
  });
});
