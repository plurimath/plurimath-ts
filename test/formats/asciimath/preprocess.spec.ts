/**
 * AsciiMath preprocessing, checked against the gem.
 *
 * Every expectation in `GEM_PARITY` is **recorded output**, not a guess: it
 * comes from `Plurimath::Asciimath::Parser.new(input).text` on the pinned
 * oracle (`plurimath-oracle`, `00c52783`, v0.11.6). A wider run — every string
 * of length 0..6 over `{ } ( ) : | x`, 137,257 inputs — agreed on all of them,
 * text and source map alike, so these cases are a readable slice of a proof
 * rather than the whole of it.
 *
 * The cases are chosen so that dropping, reordering or merging any part of the
 * chain breaks at least one of them; the comments name which.
 */

import { describe, expect, it } from "vitest";
import { preprocess } from "../../../src/formats/asciimath/preprocess";

/** `[id, input, gem output]`. */
type ParityCase = readonly [id: string, input: string, expected: string];

const GEM_PARITY: readonly ParityCase[] = [
  ["plain", "x^2 + sqrt(3)", "x^2 + sqrt(3)"],
  ["empty", "", ""],
  ["brace_pair", "{:x:}", "ℒxℛ"],
  ["paren_pair", "(:a,b:)", "ᑕa,bᑐ"],
  ["pipes_both", "|: x :|", "| x |"],
  // Overlap: the pipe pass consumes `|:` at 0, so the `:|` it leaves behind at
  // offset 2 is a fresh match, not a re-scan of its own output.
  ["pipes_overlap", "|::|", "||"],
  ["brace_overlap", "{::}", "ℒℛ"],
  // Pass order over position: a single ordered scan would take `{:` at offset 0
  // and produce "ℒ|". The gem's first gsub gets the `:|` at offset 1 first.
  ["brace_then_pipe", "{:|", "{|"],
  ["paren_then_pipe", "(:|", "(|"],
  ["pipe_then_brace", "|:}", "|}"],
  // A pass never re-runs over its own output: the result still holds `|:`.
  ["colon_pipe_colon", ":|:", "|:"],
  ["pipe_colon_pipe", "|:|", "||"],
  ["pipe_colon_alone", "|:", "|"],
  ["brace_open_alone", "{:", "ℒ"],
  ["brace_close_alone", ":}", "ℛ"],
  ["paren_open_alone", "(:", "ᑕ"],
  ["paren_close_alone", ":)", "ᑐ"],
  // `(:` runs before `:)`, so the shared `:` goes to the opener.
  ["paren_smiley", "(:)", "ᑕ)"],
  ["brace_smiley", "{:}", "ℒ}"],
  ["nested", "{:(:x:):}", "ℒᑕxᑐℛ"],
  // Preprocessing is blind to quoting — a token inside quoted text is rewritten.
  ["quoted_token", '"{:x:}"', '"ℒxℛ"'],
  ["quoted_and_bare", '"a{:b" + {:c', '"aℒb" + ℒc'],
  ["astral_before", "\u{1D465}{:y:}", "\u{1D465}ℒyℛ"],
  ["astral_between", "{:\u{1D465}:}", "ℒ\u{1D465}ℛ"],
  ["colons_pipes", "::||::", ":||:"],
  ["all_four", "{:a:} (:b:) |:c:|", "ℒaℛ ᑕbᑐ |c|"],
  ["trailing_brace", "sum_(i=1)^n i {:", "sum_(i=1)^n i ℒ"],
  ["double_colon_pipe", ":|:|", "||"],
  ["unitsml_like", '"unitsml(kg)" {:x:}', '"unitsml(kg)" ℒxℛ'],
  ["no_tokens_colons", "a : b : c", "a : b : c"],
];

/**
 * The chain, restated independently of the implementation. If the source table
 * and this one ever disagree, the round-trip test below fails.
 */
const REWRITES: ReadonlyMap<string, string> = new Map([
  ["|:", "|"],
  [":|", "|"],
  ["{:", "ℒ"],
  [":}", "ℛ"],
  ["(:", "ᑕ"],
  [":)", "ᑐ"],
]);

describe("preprocess — parity with the gem", () => {
  for (const [id, input, expected] of GEM_PARITY) {
    it(`matches Asciimath::Parser#text for ${id}`, () => {
      expect(preprocess(input).text).toBe(expected);
    });
  }

  it("substitutes the exact characters the gem does", () => {
    // Guards against an encoding-mangled source file: these four are the whole
    // reason offsets shift, and a look-alike would parse as an ordinary symbol.
    expect(preprocess("{:").text.codePointAt(0)).toBe(0x2112); // ℒ
    expect(preprocess(":}").text.codePointAt(0)).toBe(0x211b); // ℛ
    expect(preprocess("(:").text.codePointAt(0)).toBe(0x1455); // ᑕ
    expect(preprocess(":)").text.codePointAt(0)).toBe(0x1450); // ᑐ
    expect(preprocess("|:").text.codePointAt(0)).toBe(0x7c); // |
  });
});

describe("preprocess — the source map", () => {
  it("maps every offset of an input with four rewrites to the right character", () => {
    // "{:x:}+(:y:)"  ->  "ℒxℛ+ᑕyᑐ": 11 code units become 7.
    //  0 1 2 3 4 5 6 7 8 9 10        0 1 2 3 4 5 6
    const input = "{:x:}+(:y:)";
    const { text, map } = preprocess(input);
    expect(text).toBe("ℒxℛ+ᑕyᑐ");

    const expected: ReadonlyArray<readonly [offset: number, origin: number, slice: string]> = [
      [0, 0, "{:"],
      [1, 2, "x"],
      [2, 3, ":}"],
      [3, 5, "+"],
      [4, 6, "(:"],
      [5, 8, "y"],
      [6, 9, ":)"],
    ];
    for (const [offset, origin, slice] of expected) {
      expect(map.toOriginal(offset)).toBe(origin);
      expect(input.slice(origin, origin + slice.length)).toBe(slice);
    }
  });

  it("maps the first character, the last character and one past the end", () => {
    const input = "{:x:}+(:y:)";
    const { text, map } = preprocess(input);

    expect(map.toOriginal(0)).toBe(0);
    expect(input.slice(0, 2)).toBe("{:"); // first: the whole digraph, not its `:`

    const last = text.length - 1;
    expect(map.toOriginal(last)).toBe(9);
    expect(input.slice(9)).toBe(":)"); // last: reaches the end of the input

    expect(map.toOriginal(text.length)).toBe(input.length); // one past the end
    expect(map.toOriginal(text.length + 5)).toBe(input.length); // and beyond
  });

  it("clamps past the end to the end of the input, not into the last digraph", () => {
    // The pegkit regression, reproduced through the real preprocessor: an
    // "unexpected end of input" on an input ending in `{:` must report 16, the
    // length, not 15 — which is between the `{` and the `:`.
    const input = "sum_(i=1)^n i {:";
    const { text, map } = preprocess(input);
    expect(text.endsWith("ℒ")).toBe(true);
    expect(map.toOriginal(text.length)).toBe(16);
    expect(input.length).toBe(16);
  });

  it("is the identity, offset for offset, when nothing is rewritten", () => {
    const input = 'x^2 + sqrt(3) = "text"';
    const { text, map } = preprocess(input);
    expect(text).toBe(input);
    for (let offset = 0; offset <= input.length; offset++) {
      expect(map.toOriginal(offset)).toBe(offset);
    }
  });

  it("keeps both code units of an astral character distinct", () => {
    // Nothing here may assume a character is one UTF-16 unit. "{:𝑥:}" is 6
    // units; the drift after the opening digraph is one unit for BOTH halves of
    // the surrogate pair, so the pair still maps onto a pair.
    const input = "{:\u{1D465}:}";
    const { text, map } = preprocess(input);
    expect(input.length).toBe(6);
    expect(text).toBe("ℒ\u{1D465}ℛ");
    expect(text.length).toBe(4);

    expect(map.toOriginal(0)).toBe(0);
    expect(map.toOriginal(1)).toBe(2); // high surrogate
    expect(map.toOriginal(2)).toBe(3); // low surrogate — not folded onto 2
    expect(input.codePointAt(map.toOriginal(1))).toBe(0x1d465);
    expect(map.toOriginal(3)).toBe(4);
    expect(input.slice(4)).toBe(":}");
    expect(map.toOriginal(4)).toBe(6);
  });

  it("tiles the original input for every parity case", () => {
    // The general property the individual tables are instances of: consecutive
    // mapped offsets delimit exactly the source of each output unit, so the map
    // can be neither off by one nor non-monotonic anywhere.
    for (const [id, input] of GEM_PARITY) {
      const { text, map } = preprocess(input);
      expect(map.toOriginal(text.length), id).toBe(input.length);
      if (text.length > 0) expect(map.toOriginal(0), id).toBe(0);
      for (let offset = 0; offset < text.length; offset++) {
        const from = map.toOriginal(offset);
        const to = map.toOriginal(offset + 1);
        expect(from, `${id} @${offset}`).toBeLessThan(to);
        // Preprocessing only ever shortens, so an original offset is never
        // behind the preprocessed one it came from.
        expect(from, `${id} @${offset}`).toBeGreaterThanOrEqual(offset);
        const slice = input.slice(from, to);
        const unit = text.slice(offset, offset + 1);
        const rewritten = slice === unit || REWRITES.get(slice) === unit;
        expect(
          rewritten,
          `${id} @${offset}: ${JSON.stringify(slice)} -> ${JSON.stringify(unit)}`,
        ).toBe(true);
      }
    }
  });

  it("maps offset 0 of empty input to 0", () => {
    const { text, map } = preprocess("");
    expect(text).toBe("");
    expect(map.toOriginal(0)).toBe(0);
  });
});

describe("preprocess — input contract", () => {
  // The gem's `&.` leaves a nil input nil instead of raising in the
  // constructor, but the failure only moves: `Parser.new(nil).parse` raises
  // `ArgumentError: Must construct Source with a string like object.` from
  // Parslet, and `Plurimath::Math.parse(nil, :asciimath)` wraps that in
  // `Plurimath::Math::ParseError`. Nil is not supported input in the gem, so
  // there is nothing to mirror; rejecting it here beats preprocessing the text
  // "null" or failing anonymously inside the scan.
  it("rejects a non-string instead of coercing it", () => {
    for (const value of [null, undefined, 42, {}, ["x"]]) {
      expect(() => preprocess(value as unknown as string)).toThrow(TypeError);
    }
    expect(() => preprocess(null as unknown as string)).toThrow(/received null/);
    expect(() => preprocess(undefined as unknown as string)).toThrow(/received undefined/);
  });

  it("accepts an empty string", () => {
    expect(preprocess("").text).toBe("");
  });
});
