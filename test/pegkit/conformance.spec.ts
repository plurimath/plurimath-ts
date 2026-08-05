/**
 * pegkit conformance suite (ARCHITECTURE.md §6, lock condition 1).
 *
 * These assertions encode Parslet 2.0.0's *observed* behaviour, verified
 * against the vendored gem, rather than end-to-end corpus parity. The corpus
 * proves the AsciiMath grammar; this proves the engine underneath it, so a
 * divergence surfaces here as a precise failure instead of a mysterious tree
 * mismatch later.
 *
 * Scope: the subset plurimath's grammars use (§6). Behaviour outside it is
 * documented as unsupported, not implemented.
 */

import { describe, expect, it } from "vitest";
import {
  any,
  captured,
  choice,
  dynamic,
  match,
  ParseFailed,
  rule,
  Slice,
  scope,
  seq,
  str,
  tokenChoice,
} from "../../src/pegkit/index";

describe("literals and character matching", () => {
  it("str matches an exact literal and yields a Slice", () => {
    const result = str("frac").parse("frac");
    expect(result).toBeInstanceOf(Slice);
    expect(String(result)).toBe("frac");
    expect((result as Slice).offset).toBe(0);
  });

  it("match consumes exactly one character, even for a multi-char pattern", () => {
    // Parslet's Re is a predicate on the current position: /\s+/ still
    // consumes a single character. Verified against parslet 2.0.0, where
    // `Parslet.match(/\s+/).parse("   ")` fails on the leftover input.
    expect(() => match("\\s+").parse("   ")).toThrow(ParseFailed);
    expect(String(match("\\s+").parse(" "))).toBe(" ");
  });

  it("repeat(1) over match accumulates the individual characters", () => {
    expect(String(match("[0-9]").repeat(1).parse("123"))).toBe("123");
  });

  it("any matches a single character of any kind", () => {
    expect(String(any().parse("ℒ"))).toBe("ℒ");
    expect(() => any().parse("")).toThrow(ParseFailed);
  });
});

/**
 * Ruby strings are sequences of code points, so Parslet's `consume(1)` takes a
 * whole character regardless of its byte length. JavaScript strings are
 * sequences of UTF-16 units, so a character above U+FFFF is two units and
 * "consume one" has to mean "consume one code point".
 *
 * Every expectation here was checked against parslet 2.0.0 and plurimath
 * v0.11.6 (oracle `00c52783`) before being written:
 *   Parslet.any.parse("𝑥")                   => OK, one slice
 *   (Parslet.any >> Parslet.any).parse("𝑥")  => ParseFailed
 *   Plurimath::Math.parse("𝑥", :asciimath)   => one Symbol node, round-trips
 *
 * Offsets stay UTF-16: `Slice.offset` and `ParseFailed.index` index the string
 * the caller passed in, so `input.slice(index)` is meaningful. (Parslet reports
 * byte offsets with a `charpos` helper; both name the same character, in the
 * units their own runtime uses.)
 */
describe("characters above the BMP", () => {
  const astral = "\u{1D465}"; // MATHEMATICAL ITALIC SMALL X, 2 UTF-16 units
  const emoji = "\u{1F600}";

  it("any consumes the whole character, not one surrogate half", () => {
    expect(any().parse(astral)).toEqual(new Slice(astral, 0));
    expect(any().parse(emoji)).toEqual(new Slice(emoji, 0));
    // The half that used to be left behind made this pair succeed with two
    // one-unit slices; parslet fails here because there is only one character.
    expect(() => seq(any().as("a"), any().as("b")).parse(astral)).toThrow(ParseFailed);
  });

  it("match consumes the whole character", () => {
    expect(match(".").parse(astral)).toEqual(new Slice(astral, 0));
    expect(match("[^)]").repeat(1).parse(astral)).toEqual(new Slice(astral, 0));
  });

  it("a repetition counts one character, not two", () => {
    // The bug this suite missed: "a𝑥z" yielded four items, the middle two being
    // the halves of 𝑥. Offsets are UTF-16, hence 0, 1, 3 rather than 0, 1, 2.
    expect(match(".").as("c").repeat(1).parse(`a${astral}z`)).toEqual([
      { c: new Slice("a", 0) },
      { c: new Slice(astral, 1) },
      { c: new Slice("z", 3) },
    ]);
  });

  it("still counts one character for BMP input", () => {
    // π, a combining acute and a zero-width space are one unit each; parslet
    // treats all three as one character too.
    expect(match(".").as("c").repeat(1).parse("π́​")).toEqual([
      { c: new Slice("π", 0) },
      { c: new Slice("́", 1) },
      { c: new Slice("​", 2) },
    ]);
  });

  it("reports offsets a caller can slice their own string with", () => {
    const input = `a${astral}z`;
    const tree = seq(str("a"), any().as("mid"), str("z")).parse(input) as { mid: Slice };
    expect(input.slice(tree.mid.offset, tree.mid.offset + tree.mid.text.length)).toBe(astral);

    try {
      seq(str("a"), any(), str("Q")).parse(input);
      expect.unreachable("should have thrown");
    } catch (error) {
      const { index } = error as ParseFailed;
      expect(index).toBe(3); // past the two units of 𝑥, not one
      expect(input.slice(index)).toBe("z");
    }
  });

  it("dispatches tokenChoice on an astral first character", () => {
    // Both keys start with the same lead surrogate, so they share a bucket and
    // ordered choice inside it decides — the dispatch is on the same unit the
    // input is indexed by, so it stays consistent.
    const tokens = tokenChoice([
      ["\u{1D465}", str("\u{1D465}")],
      ["\u{1D466}", str("\u{1D466}")],
    ]);
    expect(String(tokens.parse("\u{1D466}"))).toBe("\u{1D466}");
    expect(() => tokens.parse("\u{1D467}")).toThrow(ParseFailed);
  });

  it("consumes an unpaired surrogate as one unit", () => {
    // Documented divergence: a lone surrogate is not expressible in Ruby, so
    // there is no gem behaviour to match. Consuming it keeps the parser total
    // instead of stalling on input no rule can advance past.
    expect(any().parse("\ud835")).toEqual(new Slice("\ud835", 0));
    expect(match(".").parse("\udc65")).toEqual(new Slice("\udc65", 0));
  });
});

describe("sequence flattening", () => {
  it("merges adjacent unnamed slices into one", () => {
    const result = seq(str("a"), str("b")).parse("ab");
    expect(result).toBeInstanceOf(Slice);
    expect(String(result)).toBe("ab");
  });

  it("merges two named results into one hash", () => {
    expect(seq(str("a").as("x"), str("b").as("y")).parse("ab")).toEqual({
      x: new Slice("a", 0),
      y: new Slice("b", 1),
    });
  });

  it("drops an unnamed slice that sits beside a named result", () => {
    expect(seq(str("("), str("x").as("inner")).parse("(x")).toEqual({
      inner: new Slice("x", 1),
    });
  });

  it("hoists a named result into an adjacent repetition (array >> hash)", () => {
    // Verified against parslet 2.0.0:
    //   str("a").as(:item).repeat(1) >> str("b").as(:tail)
    //     => [{item: "a"@0}, {item: "a"@1}, {tail: "b"@2}]
    // ARCHITECTURE.md §6 requires this hoisting; it used to raise instead.
    expect(seq(str("a").as("item").repeat(1), str("b").as("tail")).parse("aab")).toEqual([
      { item: new Slice("a", 0) },
      { item: new Slice("a", 1) },
      { tail: new Slice("b", 2) },
    ]);
  });

  it("hoists a named result into an adjacent repetition (hash >> array)", () => {
    expect(seq(str("b").as("tail"), str("a").as("item").repeat(1)).parse("baa")).toEqual([
      { tail: new Slice("b", 0) },
      { item: new Slice("a", 1) },
      { item: new Slice("a", 2) },
    ]);
  });

  it("keeps the later value when a key repeats, rather than raising", () => {
    // Parslet warns and keeps the last value; it does not fail the parse.
    expect(seq(str("a").as("k"), str("b").as("k")).parse("ab")).toEqual({
      k: new Slice("b", 1),
    });
  });
});

describe("maybe", () => {
  it("yields null when it does not match, and vanishes in a sequence", () => {
    expect(str("x").maybe().parse("")).toBeNull();
    expect(String(seq(str("a"), str("b").maybe()).parse("a"))).toBe("a");
  });

  it("keeps the value when it does match", () => {
    expect(seq(str("a"), str("b").maybe()).parse("ab")).toEqual(new Slice("ab", 0));
  });
});

describe("repeat", () => {
  it("collapses slice results into a single slice", () => {
    expect(str("a").repeat(0).parse("aaa")).toEqual(new Slice("aaa", 0));
  });

  it("keeps named results as an array", () => {
    expect(str("a").as("item").repeat(1).parse("aa")).toEqual([
      { item: new Slice("a", 0) },
      { item: new Slice("a", 1) },
    ]);
  });

  it("enforces its minimum", () => {
    expect(() => str("a").repeat(1).parse("")).toThrow(ParseFailed);
  });

  it("stops on a zero-width match instead of looping forever", () => {
    expect(String(seq(str("x").maybe().repeat(0), str("y")).parse("y"))).toBe("y");
  });
});

describe("lookahead", () => {
  it("absent? succeeds without consuming when the inner atom fails", () => {
    expect(String(seq(str("b").absent(), str("a")).parse("a"))).toBe("a");
    expect(() => seq(str("a").absent(), str("a")).parse("a")).toThrow(ParseFailed);
  });

  it("present? succeeds without consuming when the inner atom matches", () => {
    expect(String(seq(str("a").present(), str("ab")).parse("ab"))).toBe("ab");
    expect(() => seq(str("b").present(), str("a")).parse("a")).toThrow(ParseFailed);
  });
});

describe("capture, dynamic and scope", () => {
  const closing: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

  /** The context-sensitive shape AsciiMath's `text(...)` rule needs. */
  const fenced = seq(
    match("[([{]").capture("paren"),
    dynamic((ctx) => {
      const open = captured(ctx, "paren") ?? "(";
      return match(`[^${closing[open]?.replace(/[\]\\^-]/g, "\\$&")}]`)
        .repeat(0)
        .as("body");
    }),
    dynamic((ctx) => str(closing[captured(ctx, "paren") ?? "("] as string)),
  );

  it("closes with the bracket that was captured", () => {
    expect(fenced.parse("(abc)")).toEqual({ body: new Slice("abc", 1) });
    expect(fenced.parse("[abc]")).toEqual({ body: new Slice("abc", 1) });
  });

  it("rejects a mismatched closing bracket", () => {
    expect(() => fenced.parse("(abc]")).toThrow(ParseFailed);
  });

  it("scope discards captures made inside it", () => {
    // Inner capture of :paren must not leak out and change how the outer
    // construct closes.
    const nested = seq(
      str("(").capture("paren"),
      scope(seq(str("[").capture("paren"), str("x"), str("]"))),
      dynamic((ctx) => str(closing[captured(ctx, "paren") ?? "("] as string)),
    );
    expect(() => nested.parse("([x])")).not.toThrow();
  });
});

describe("ordered choice", () => {
  it("takes the first alternative that matches, not the longest", () => {
    const ambiguous = choice([str("a"), str("ab")]);
    expect(String(ambiguous.parse("a"))).toBe("a");
    // "ab" cannot parse: the first alternative wins and leaves "b" behind.
    expect(() => ambiguous.parse("ab")).toThrow(ParseFailed);
  });
});

describe("failure positions", () => {
  it("tokenChoice records its position when no bucket matches", () => {
    // Regression: with no bucket for the current character, no inner atom runs,
    // so nothing advanced maxPos and ParseFailed.index pointed at an earlier
    // position than the real failure.
    const grammar = seq(
      str("a"),
      tokenChoice([
        ["b", str("b")],
        ["c", str("c")],
      ]),
    );
    try {
      grammar.parse("az");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ParseFailed);
      expect((error as ParseFailed).index).toBe(1); // at "z", not back at 0
    }
  });

  it("tokenChoice records its position when the bucket exists but all fail", () => {
    const grammar = seq(str("a"), tokenChoice([["b", str("bb")]]));
    try {
      grammar.parse("ab");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ParseFailed).index).toBe(1);
    }
  });
});

describe("packrat memoisation", () => {
  it("keeps exponential-looking grammars linear", () => {
    // Parslet 2.0.0 memoises by (atom, position) in Atoms::Context. Without
    // the same cache, a grammar that revisits positions this heavily takes
    // seconds; the assertion is a wall-clock ceiling, generous enough not to
    // be flaky but far below unmemoised behaviour.
    const expr: import("../../src/pegkit/index").Atom = rule(() =>
      choice([
        seq(str("("), expr, str(")")),
        seq(str("("), expr, str("+"), expr, str(")")),
        str("x"),
      ]),
    );
    const deep = `${"(".repeat(12)}x${")".repeat(12)}`;
    const started = performance.now();
    expect(String(expr.parse(deep))).toBe(deep);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("stack safety", () => {
  it("reports deeply nested input as a clean ParseFailed", () => {
    const expr: import("../../src/pegkit/index").Atom = rule(() =>
      choice([seq(str("("), expr, str(")")), str("x")]),
    );
    // No closing brackets: the grammar recurses as far as the input allows.
    expect(() => expr.parse("(".repeat(5000))).toThrow(ParseFailed);
  });

  it("carries the failure position", () => {
    try {
      str("a").parse("b");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ParseFailed);
      expect((error as ParseFailed).index).toBe(0);
    }
  });
});
