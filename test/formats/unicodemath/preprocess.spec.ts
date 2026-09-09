/**
 * `UnicodeMath::Parser#initialize` / `#pre_processing` parity
 * (`lib/plurimath/unicode_math/parser.rb:10-22, 43-53`).
 *
 * Every expectation below was READ OFF the pinned clone (`00c52783`,
 * htmlentities 4.4.2), never predicted from the Ruby. The probe instantiated
 * `Plurimath::UnicodeMath::Parser.new(input)` and read `#text` and `@splitted`;
 * separately it re-executed the constructor's statements one at a time and
 * asserted the stepwise result equalled `#text`, so the pass-by-pass reasoning
 * in `preprocess.ts` is measured rather than asserted.
 */

import { describe, expect, it } from "vitest";
import { ParseError } from "../../../src/core/index";
import { parseUnicodemath } from "../../../src/formats/unicodemath/index";
import { preprocess } from "../../../src/formats/unicodemath/preprocess";

/** `[input, Parser#text, @splitted]`, exactly as the clone reported them. */
const MEASURED: ReadonlyArray<readonly [string, string, string | undefined]> = [
  // Untouched: printable ASCII outside `<>'"&` survives verbatim.
  ["a+b", "a+b", undefined],

  // `:12` encodes; `:13`/`:14` undo `&` and `"` immediately afterwards.
  ["√(a)", "&#x221a;(a)", undefined],
  ["α", "&#x3b1;", undefined],
  // One astral code point is ONE entity, not a surrogate pair.
  ["𝕒", "&#x1d552;", undefined],
  ["a&b", "a&b", undefined],
  ['a"b', 'a"b', undefined],
  ["a<b>c", "a&#x3c;b&#x3e;c", undefined],
  ["a'b", "a&#x27;b", undefined],
  // No `decode` before the `encode`, unlike LaTeX's: `&` becomes `&#x26;` and
  // comes straight back, so an entity the caller wrote round-trips untouched.
  ["&amp;", "&amp;", undefined],

  // `:15` — `⫷…⫸` deleted, matched against the ENTITIES and GREEDY, so the `y`
  // between two spans goes with them.
  ["⫷ hidden ⫸", "", undefined],
  ["x⫷a⫸y⫷b⫸z", "xz", undefined],

  // `:16` — two backslashes become one.
  ["\\\\", "\\", undefined],
  ["a\\\\b", "a\\b", undefined],
  ["\\\\\\\\", "\\\\", undefined],
  ["\\", "\\", undefined],
  ["a\\b", "a\\b", undefined],
  // `:16` then `:21`: backslash-backslash-space halves, then the space strips.
  ["\\\\ ", "\\", undefined],

  // `:17-20` — `\uXXXX` to a hex entity, with the gem's `\w{0,5}` bug intact.
  ["\\u0041", "&#x0041;", undefined],
  ["\\u41", "&#x41;", undefined],
  ["\\u12345", "&#x12345;", undefined],
  // `[\da-fA-F]{1,5}` greedily takes `0041a`; `\w{0,5}` then EATS `bc`.
  ["\\u0041abc", "&#x0041a;", undefined],
  // …and eats only five, so `gh` survives.
  ["\\u0041abcdefgh", "&#x0041a;gh", undefined],
  ["\\uZZZ", "\\uZZZ", undefined],
  // `:16` runs first, so a doubled escape is halved and then rewritten.
  ["\\\\u0041", "&#x0041;", undefined],

  // `:21` — only spaces can reach `strip`; a newline is already `&#xa;`.
  ["  a+b  ", "a+b", undefined],
  ["\n a \n", "&#xa; a &#xa;", undefined],

  // `:49-52` — the `#` split. The label is the LAST field; a middle one is lost.
  ["a#b", "a", "b"],
  ["a##b", "a", "b"],
  // Ruby's `split` drops TRAILING empty fields, so this has one field and no
  // label at all.
  ["a#", "a", undefined],
  ["#a", "", "a"],
  ["a#b#c", "a", "c"],

  // `:46-48` — a `#` inside `✎(…)` is protected from the split and restored.
  ["✎(a#b)", "&#x270e;(a#b)", undefined],
  ["✎(a#b) # 3", "&#x270e;(a#b)", " 3"],
  // GREEDY: the span runs to the LAST `)`, swallowing the separator `#` too, so
  // this does not split at all.
  ["✎(a#b) # ✎(c#d)", "&#x270e;(a#b) # &#x270e;(c#d)", undefined],
  // `:50` rewrites field 0 ONLY, so a protected span left in the tail keeps the
  // stand-in verbatim. A gem bug, reproduced.
  ["x # ✎(a#b)", "x", ' ✎(a"replacement"b)'],
  // …and the rewrite is blind, so a `"replacement"` the CALLER wrote becomes a
  // `#`. The other half of the same bug.
  ['a"replacement"#b', "a#", "b"],
  ['a#b"replacement"', "a", 'b"replacement"'],

  // `LABELED_TR_REGEX` is computed and DISCARDED at `:44`, so a quoted `#`
  // still splits — the regex guards nothing.
  ['"a#b"', '"a', 'b"'],
  ['"a#b" # 7', '"a', " 7"],

  // An entity the caller wrote whose body contains `#` splits on it.
  ["&#x41;", "&", "x41;"],
  ["&#65;", "&", "65;"],
  ["a&#x23;b", "a&", "x23;b"],
];

describe("preprocessing reproduces the gem's", () => {
  it.each(MEASURED.map((row) => [row[0], row] as const))("%j", (_input, [input, text, label]) => {
    const result = preprocess(input);
    expect(result.text).toBe(text);
    expect(result.label).toBe(label);
  });
});

/**
 * `parser.rb:50` calls `splitted.first.gsub` with no nil guard, and Ruby's
 * `split` returns `[]` for both of these. Measured on the clone: the constructor
 * raises `NoMethodError: undefined method 'gsub' for nil`, and
 * `Plurimath::Math.parse(input, :unicode)` — which rescues `StandardError` —
 * turns that into `Plurimath::Math::ParseError`.
 */
describe("the inputs whose split leaves no field", () => {
  it.each([[""], ["#"]])("%j reaches the caller as a ParseError", (input) => {
    expect(() => preprocess(input)).toThrow(/splits to no fields/);
    expect(() => parseUnicodemath(input)).toThrow(ParseError);
  });
});

describe("the source map", () => {
  it("reports failure positions in the caller's input, not the encoded text", () => {
    // `√` is one character in, and encodes to the eight characters `&#x221a;`.
    // An offset taken from the preprocessed text would land far past the `@`.
    const input = "√@";
    let thrown: unknown;
    try {
      parseUnicodemath(input);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ParseError);
    const { index } = thrown as ParseError;
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThanOrEqual(input.length);
  });

  it("clamps a past-the-end failure to the end of the caller's input", () => {
    // The `#` tail is truncated, so the preprocessed text is shorter than the
    // input and a failure at its end must still not exceed the input's length.
    const input = "√(#label";
    let thrown: unknown;
    try {
      parseUnicodemath(input);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ParseError);
    expect((thrown as ParseError).index).toBeLessThanOrEqual(input.length);
  });
});

describe("a non-string input", () => {
  it("is refused rather than stringified", () => {
    expect(() => preprocess(null as unknown as string)).toThrow(TypeError);
    // Through the entry point it is normalised like every other refusal.
    expect(() => parseUnicodemath(null as unknown as string)).toThrow(ParseError);
  });
});
