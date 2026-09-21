/**
 * Adversarial inputs — deep nesting, unmatched fences, long token runs.
 *
 * The bar is a **clean outcome in bounded time**: a parse, or one of the port's
 * own typed errors. Never a crash, never a hang, never a stack overflow.
 *
 * This is deliberately a port-side bar rather than a parity one, and the
 * measurements are why. Against the pinned oracle (`plurimath-oracle` at
 * `00c52783`, measured 2026-08-17):
 *
 * | input | gem | this port |
 * |---|---|---|
 * | 300-deep `(…)` nesting | `SystemStackError` | `ParseError` |
 * | 500 space-separated tokens | parses, **64.5 seconds** | parses, ~200ms |
 * | 1000 space-separated tokens | `SystemStackError` | `ParseError` |
 *
 * A `SystemStackError` is not behaviour to reproduce — it is the absence of
 * defined behaviour, and PORTING-STANDARDS' "do not be more correct than the
 * gem" governs results, not crashes. So these cases assert that *this* port
 * stays inside its own contract, and say nothing about matching the gem where
 * the gem has nothing to match.
 *
 * `ARCHITECTURE.md` §7 calls this gate "clean failures", which is the one
 * phrase to be careful with: unmatched fences **parse** rather than fail, in
 * the gem and here alike, so asserting a failure for them would pin the
 * opposite of the real behaviour. The leniency cases below pin what happens.
 */

import { describe, expect, it } from "vitest";
import { ParseError, type PlurimathErrorCode } from "../../src/core/errors";
import { parseAsciimath } from "../../src/formats/asciimath/parser";
import { toAsciimath } from "../../src/formats/asciimath/renderer";
import { parseHtml } from "../../src/formats/html/parser";
import { parseLatex } from "../../src/formats/latex/parser";
import { toLatex } from "../../src/formats/latex/renderer";
import { toMathml } from "../../src/formats/mathml/renderer";
import { parseUnicodemath } from "../../src/formats/unicodemath/parser";
import { toUnicodemath } from "../../src/formats/unicodemath/renderer";
import { DEPTH_LIMIT_MESSAGE, dynamic, STACK_EXHAUSTED_MESSAGE } from "../../src/pegkit/atom";

/** The typed failures this gate accepts as a clean outcome. */
const CLEAN_CODES: ReadonlySet<string> = new Set<PlurimathErrorCode>([
  "PARSE_ERROR",
  "RENDER_ERROR",
]);

/**
 * The error's `code`, or `null` if this is not one of the port's typed errors.
 *
 * Discriminating on `code` rather than `instanceof` is the contract in
 * `src/core/errors.ts` and ARCHITECTURE.md §5: the package ships ESM and CJS
 * builds, an application can end up holding both copies of these classes, and
 * `instanceof` across copies silently returns false. A guard written with
 * `instanceof` would therefore classify a perfectly typed `ParseError` as a
 * crash — or, in the shape that matters here, would need weakening until it
 * stopped catching real crashes.
 */
function cleanErrorCode(error: unknown): string | null {
  // `instanceof Error` as well as the code: a thrown plain object carrying
  // `{ code: "PARSE_ERROR" }` is not a typed error from this package, and
  // accepting one would let `throw { code: "PARSE_ERROR" }` anywhere in the
  // parser read as a clean outcome. Both copies of the classes in a dual
  // ESM/CJS load still extend the same realm's `Error`, so this keeps the
  // cross-copy case working.
  if (!(error instanceof Error)) return null;
  const code = (error as Error & { readonly code?: unknown }).code;
  return typeof code === "string" && CLEAN_CODES.has(code) ? code : null;
}

type Outcome = "parsed" | "PARSE_ERROR" | "RENDER_ERROR";

type ParsedFormula = ReturnType<typeof parseAsciimath>;

/** A grammar's public parse entry point, as `outcomeOf` drives it. */
type Parse = (input: string) => ParsedFormula;

const RENDERERS: ReadonlyArray<readonly [string, (node: ParsedFormula) => string]> = [
  ["toAsciimath", toAsciimath],
  ["toLatex", toLatex],
  ["toMathml", toMathml],
  ["toUnicodemath", toUnicodemath],
];

/** Runs one input all the way to a clean outcome, or rethrows what it got. */
function outcomeOf(
  input: string,
  renderers: typeof RENDERERS = RENDERERS,
  parse: Parse = parseAsciimath,
): Outcome {
  let node: ParsedFormula;
  try {
    node = parse(input);
  } catch (error) {
    const code = cleanErrorCode(error);
    if (code === null) throw error;
    return code as Outcome;
  }
  // Every renderer runs, whatever the others did. Sharing one `try` meant a
  // typed `RenderError` from `toAsciimath` returned before `toLatex` or
  // `toMathml` were called at all — so either of those could have crashed with
  // an untyped error and the gate would still have reported a clean outcome.
  const failures = renderers
    .map(([name, render]) => {
      try {
        render(node);
        return null;
      } catch (error) {
        const code = cleanErrorCode(error);
        if (code === null) throw error;
        return [name, code] as const;
      }
    })
    .filter((entry) => entry !== null);

  return failures.length === 0 ? "parsed" : (failures[0]?.[1] as Outcome);
}

/** `frac(frac(…)(2))(2)` — every level a complete binary fraction. */
function nestedFrac(depth: number): string {
  let value = "1";
  for (let level = 0; level < depth; level += 1) value = `frac(${value})(2)`;
  return value;
}

/**
 * Each case pins the outcome it must produce, not merely that *some* clean
 * outcome happens. Accepting any of the three per row let a real regression
 * through: the 500-token parse could start rejecting, or a nesting case could
 * start producing a model no renderer walks, and the gate stayed green because
 * an unrelated row still parsed.
 *
 * Every value below was measured (2026-08-17), not predicted. Sizes cross the
 * thresholds while keeping the suite quick — the parser is linear in input
 * length (5,000 closing parens 1.96s, 40,000 15.1s), so the big cases are the
 * slow ones and sit just past the boundary rather than as large as possible.
 */
const CASES: ReadonlyArray<readonly [string, string, Outcome]> = [
  ["nesting: 2,000 nested parens", `${"(".repeat(2000)}x${")".repeat(2000)}`, "PARSE_ERROR"],
  ["nesting: 2,000 nested sqrt", `${"sqrt(".repeat(2000)}2${")".repeat(2000)}`, "PARSE_ERROR"],
  ["nesting: 500 complete nested frac", nestedFrac(500), "PARSE_ERROR"],
  ["nesting: 20 complete nested frac", nestedFrac(20), "parsed"],
  ["fences: 5,000 unmatched open", `${"(".repeat(5000)}x`, "PARSE_ERROR"],
  ["fences: 2,000 unmatched close", `x${")".repeat(2000)}`, "parsed"],
  ["fences: alternating unmatched", "(x)) ((y) {: z", "parsed"],
  // 250, not 500: the transition sits at 625-650 symbols and is *stack*
  // exhaustion, so it moves with the engine's stack size. A pin at 500 would
  // fail on a runtime with a slightly smaller stack and no parser regression.
  ["tokens: 250 symbols", Array.from({ length: 250 }, () => "a").join(" "), "parsed"],
  ["tokens: 5,000 symbols", Array.from({ length: 5000 }, () => "a").join(" "), "PARSE_ERROR"],
  ["tokens: 5,000 digits, no spaces", "1".repeat(5000), "parsed"],
  ["tokens: 2,000 superscripts", `x${"^y".repeat(2000)}`, "PARSE_ERROR"],
  ["tokens: 20,000 characters of one symbol", "a".repeat(20000), "PARSE_ERROR"],
  ["whitespace only", "   ", "RENDER_ERROR"],
];

/**
 * Twenty-five times the slowest measured case (2,000 unmatched closing parens, ~0.8s).
 * This ceiling proves only that this fixed sample finishes within the budget on this run.
 */
const SLOWEST_ALLOWED_MS = 20_000;

describe("every adversarial input reaches the clean outcome it is pinned to", () => {
  const seen: Outcome[] = [];

  it.each(CASES)("%s", (label, input, expected) => {
    const started = performance.now();
    const outcome = outcomeOf(input);
    const elapsed = performance.now() - started;
    seen.push(outcome);
    expect(outcome).toBe(expected);
    // **This does not bound a hang, and an earlier version of this comment
    // wrongly claimed it did.** `outcomeOf` is synchronous, so a non-returning
    // loop inside it blocks the very event loop that would have to fire
    // vitest's timeout: the runner would hang, not fail. Only CI's job timeout
    // catches that.
    //
    // What this *does* catch is the realistic regression — parse time going
    // superlinear. Every case here was measured under 2s; the ceiling is set
    // far above that so ordinary machine noise cannot trip it, while a
    // quadratic blowup on these sizes would be nowhere near it.
    expect(elapsed, `${label} took ${Math.round(elapsed)}ms`).toBeLessThan(SLOWEST_ALLOWED_MS);
  });

  it("exercised every case", () => {
    expect(CASES.length).toBeGreaterThan(0);
    expect(seen.length).toBe(CASES.length);
  });

  it("covers all three outcomes, so no one shape carries the gate", () => {
    expect(new Set(seen)).toStrictEqual(new Set(["parsed", "PARSE_ERROR", "RENDER_ERROR"]));
  });
});

describe("the guard rejects what it exists to reject", () => {
  it("counts the port's typed errors as clean", () => {
    expect(cleanErrorCode(new ParseError("nope", "x", "asciimath", 0))).toBe("PARSE_ERROR");
  });

  it("does not count a real stack overflow as clean", () => {
    // Provoked, not constructed: a hand-made RangeError would prove only that
    // the guard reads the class it was handed.
    const overflow = ((): unknown => {
      try {
        const recurse = (depth: number): number => recurse(depth + 1);
        return recurse(0);
      } catch (error) {
        return error;
      }
    })();

    expect(overflow).toBeInstanceOf(RangeError);
    expect((overflow as Error).message).toMatch(/call stack/i);
    expect(cleanErrorCode(overflow)).toBeNull();
  });

  it("does not count an arbitrary failure as clean", () => {
    expect(cleanErrorCode(new TypeError("undefined is not a function"))).toBeNull();
    expect(cleanErrorCode(undefined)).toBeNull();
    expect(cleanErrorCode({ code: "SOMETHING_ELSE" })).toBeNull();
  });

  it("still counts a typed error from a second copy of the class", () => {
    // What a dual ESM/CJS load produces: same shape, different class identity.
    // `instanceof` is false across copies, which is why the contract in
    // src/core/errors.ts makes `code` the discriminator.
    class ParseErrorFromAnotherBuild extends Error {
      readonly code = "PARSE_ERROR";
    }
    const foreign = new ParseErrorFromAnotherBuild("nope");

    expect(foreign instanceof ParseError).toBe(false);
    expect(cleanErrorCode(foreign)).toBe("PARSE_ERROR");
  });
});

describe("a typed failure in one renderer does not hide a crash in a later one", () => {
  // The regression test for the shared-`try` bug. While every renderer sat in
  // one `try`, a typed `RenderError` from the first returned before the others
  // ran, so an untyped throw from a later one was never seen.
  // Restoring that shape makes this test fail; without it, nothing would.
  const typedFirst = (): string => {
    throw new ParseError("typed", "x", "asciimath", 0);
  };
  const untypedSecond = (): string => {
    throw new TypeError("this is the crash that used to be skipped");
  };

  it("propagates the untyped throw from the second renderer", () => {
    expect(() =>
      outcomeOf("x", [
        ["typedFirst", typedFirst],
        ["untypedSecond", untypedSecond],
      ]),
    ).toThrow(TypeError);
  });

  it("propagates it from the third renderer too", () => {
    expect(() =>
      outcomeOf("x", [
        ["typedFirst", typedFirst],
        ["ok", () => "x"],
        ["untypedThird", untypedSecond],
      ]),
    ).toThrow("used to be skipped");
  });

  it("reports the typed failure when every later renderer is fine", () => {
    expect(
      outcomeOf("x", [
        ["typedFirst", typedFirst],
        ["ok", () => "x"],
      ]),
    ).toBe("PARSE_ERROR");
  });
});

describe("deep input is refused by a guard that says which guard it was", () => {
  /** The message identifying which of the two guards produced a rejection. */
  function guardFor(input: string): string {
    try {
      parseAsciimath(input);
      return "parsed";
    } catch (error) {
      return (error as Error).message;
    }
  }

  it("refuses every rejected shape through the stack guard, not the depth cap", () => {
    // Measured, and the opposite of what this spec first claimed. Driven off
    // the table rather than a hand-picked sample, so a row that changes guard
    // — or stops being stack-driven — fails here instead of quietly diverging
    // from the prose.
    const rejecting = CASES.filter(([, , expected]) => expected === "PARSE_ERROR");
    expect(rejecting.length).toBeGreaterThan(0);
    for (const [label, input] of rejecting) {
      expect(guardFor(input), label).toBe(STACK_EXHAUSTED_MESSAGE);
    }
  });

  it("does not relabel an unrelated RangeError as stack exhaustion", () => {
    // The fallback used to catch every `RangeError`. `RangeError` is a
    // general-purpose error — `new Array(-1)` throws one — so relabelling all
    // of them would report "the parser stack was exhausted" for a bug that had
    // nothing to do with recursion, and this file's assertions would have
    // agreed.
    const unrelated = ((): unknown => {
      try {
        return new Array(-1);
      } catch (error) {
        return error;
      }
    })();

    expect(unrelated).toBeInstanceOf(RangeError);
    expect((unrelated as Error).message).not.toMatch(/call stack|too much recursion/i);

    // And the parser really does let one through rather than relabelling it.
    const throwsRangeError = dynamic(() => {
      throw new RangeError("sentinel, nothing to do with recursion");
    });
    expect(() => throwsRangeError.parse("")).toThrow("sentinel");
    expect(() => throwsRangeError.parse("")).not.toThrow(STACK_EXHAUSTED_MESSAGE);
  });

  it("recognises SpiderMonkey's InternalError, which is not a RangeError", () => {
    // Firefox throws `InternalError: too much recursion`. An
    // `instanceof RangeError` test excludes it before the message matters, so
    // the regex's "too much recursion" branch was unreachable on the one engine
    // it was written for — coverage claimed and not delivered.
    class InternalError extends Error {
      override readonly name = "InternalError";
    }
    const spiderMonkey = dynamic(() => {
      throw new InternalError("too much recursion");
    });
    expect(() => spiderMonkey.parse("")).toThrow(STACK_EXHAUSTED_MESSAGE);

    // …while an InternalError from anything else still travels unchanged.
    const unrelated = dynamic(() => {
      throw new InternalError("something else entirely");
    });
    expect(() => unrelated.parse("")).toThrow("something else entirely");
    expect(() => unrelated.parse("")).not.toThrow(STACK_EXHAUSTED_MESSAGE);
  });

  it("keeps the two guards distinguishable", () => {
    // The point of separate messages: while they were identical, this file
    // asserted "the depth cap fired" for a rejection the cap had no part in,
    // and would have kept passing if the cap were deleted. `MAX_DEPTH` has not
    // been observed to fire for any AsciiMath input — see `deferred.md`.
    expect(DEPTH_LIMIT_MESSAGE).not.toBe(STACK_EXHAUSTED_MESSAGE);
  });

  it("still parses depth the guards allow, so they are not refusing everything", () => {
    expect(outcomeOf(`${"(".repeat(100)}x${")".repeat(100)}`)).toBe("parsed");
    expect(outcomeOf(nestedFrac(20))).toBe("parsed");
  });
});

/**
 * AsciiMath's grammar is far more lenient than it looks, and TODO 8 measured
 * the gem accepting all of these. Pinning them stops a future "harden the
 * parser" change from quietly rejecting input the gem takes.
 */
describe("unmatched fences parse, as they do in the gem", () => {
  it.each([
    ["(a", "(a)"],
    ["a)", "a )"],
    ["{: x", "{:x)"],
  ])("%s renders as %s", (input, rendered) => {
    expect(toAsciimath(parseAsciimath(input))).toBe(rendered);
  });
});

/**
 * Whitespace-only input parses to a formula holding a bare string, which no
 * renderer can walk.
 *
 * The gem does the same thing (verified against `00c52783`): `Math.parse("   ",
 * :asciimath)` returns a `Formula`, and `Formula#to_asciimath` then raises
 * `Plurimath::Math::ParseError` — whose `cause` is `NoMethodError: undefined
 * method 'to_asciimath' for an instance of Parslet::Slice`. So the failure is
 * internal, wrapped at the public boundary, and a typed `RenderError` here is
 * the porting-correct outcome rather than a defect.
 *
 * It is pinned separately because it is a *render*-time failure for input that
 * parsed, which the table above would otherwise bury.
 */
describe("whitespace-only input fails at render, with a typed error", () => {
  it("parses, then refuses to render, and says which value it choked on", () => {
    expect(outcomeOf("   ")).toBe("RENDER_ERROR");
    expect(() => toAsciimath(parseAsciimath("   "))).toThrow(/cannot render the bare string/);
  });
});

/**
 * The LaTeX, HTML and UnicodeMath grammars — the same bar, the same guards.
 *
 * This spec exercised only AsciiMath while three more grammars landed, so
 * nothing had asked whether they refuse pathological input cleanly. The rows
 * below do, and every gem figure in them was measured against the pinned
 * oracle (`plurimath-oracle` at `00c52783`, 2026-09-21) through
 * `Plurimath::Math.parse(input, type)`; every port figure through the public
 * `parseLatex` / `parseHtml` / `parseUnicodemath` on the same day.
 *
 * What the gem does, by shape (nesting depth `n` counts input levels; "parses"
 * means `Math.parse` returned, not that any renderer was run):
 *
 * | shape | gem | this port |
 * |---|---|---|
 * | LaTeX `{`, `\frac`, `\sqrt`, `(`, `\left(`, `^{` at n=20 | parses | parses |
 * | LaTeX `{` at n=80, `\frac` at n=60 | parses | parses |
 * | LaTeX `\frac` at n=80 (also `{` at 100) | `SystemStackError` | `\frac` refused from n=70; `{` parses at 100, refused at 150 |
 * | LaTeX all shapes at n=1000 | `SystemStackError` (100 and 300 measured) | `ParseError`, stack guard |
 * | UnicodeMath `(`, `√(`, `(…)/(…)`, `[` at n=20 | parses | parses |
 * | UnicodeMath `(` and `(…)/(…)` at n=80 | parses | parses |
 * | UnicodeMath the same at n=100 | `SystemStackError` | parses (`(`, `[`, `(…)/(…)` to 250, `√(` to 150) |
 * | UnicodeMath all shapes at n=1000 | `SystemStackError` (100 and 300 measured) | `ParseError`, stack guard |
 * | HTML `<mrow>`/`<sup>` at n=20..80 | parses | parses at 20 (80 not measured on the port) |
 * | HTML `<mrow>`/`<sup>` at n=100 | `ParseError` (JSON nesting) | `ParseError`, `nesting of 100 is too deep` |
 * | HTML `<mrow>`/`<sup>` at n=300 | `SystemStackError` | `ParseError` (`<sup>`: nesting message; `<mrow>`: stack guard) |
 * | unmatched closers, n up to 300 (1000 for the port) | `ParseError` | `ParseError` |
 *
 * The gem's own nesting ceiling therefore sits between 60 and 100 levels in
 * LaTeX and between 80 and 100 in UnicodeMath, and the port's sits at or above
 * it at every point measured on both sides, with one near-tie: LaTeX `\frac`
 * is refused from n=70 on the port, while the gem parsed 60 and overflowed at
 * 80 and was not measured between. So no measured depth is one where the gem
 * parses and the port refuses. The ceilings move with the engine's stack size,
 * so, as the AsciiMath table does, parses are pinned at n=20 and refusals at
 * n=1000, both far from any transition; the band in between is described here
 * rather than asserted.
 *
 * Every refusal in the table is one of two guards, and NEITHER is
 * `MAX_DEPTH`: the stack guard (`STACK_EXHAUSTED_MESSAGE`) or, for HTML only,
 * the JSON round trip's own `nesting of 100 is too deep`. That extends the
 * deferred.md finding — `MAX_DEPTH` never fires — from AsciiMath to all four
 * grammars, and the "guard" assertion below fails if it ever does.
 *
 * Where the gem parses and the port refuses (measured, 2026-09-21), the row
 * says so. All are UnicodeMath, whose transform is a slice: `finalize` throws
 * for a rule family it does not carry, and that reaches the caller as a typed
 * `ParseError` (a refusal at the transform, not the grammar). Pinning them as
 * refusals keeps the pin honest — they will need updating when the family lands.
 */
type GrammarName = "latex" | "html" | "unicodemath";

const PARSERS: Readonly<Record<GrammarName, Parse>> = {
  latex: parseLatex,
  html: parseHtml,
  unicodemath: parseUnicodemath,
};

const repeat = (unit: string, count: number): string => unit.repeat(count);
const wrapped = (open: string, core: string, close: string, depth: number): string =>
  `${repeat(open, depth)}${core}${repeat(close, depth)}`;
/** `template(inner)` applied `depth` times to `1`. */
const layered = (template: (inner: string) => string, depth: number): string => {
  let value = "1";
  for (let level = 0; level < depth; level += 1) value = template(value);
  return value;
};

const DEEP = 1000;
const SHALLOW = 20;

type GrammarCase = readonly [grammar: GrammarName, label: string, input: string, expected: Outcome];

const GRAMMAR_CASES: ReadonlyArray<GrammarCase> = [
  // --- LaTeX. Gem: parses at 20; SystemStackError at 100 for every shape
  // below (measured). Port: parses at 20; the stack guard at 1000.
  ["latex", "20 nested braces", wrapped("{", "x", "}", SHALLOW), "parsed"],
  ["latex", "1,000 nested braces", wrapped("{", "x", "}", DEEP), "PARSE_ERROR"],
  ["latex", "20 nested \\frac", layered((v) => `\\frac{${v}}{2}`, SHALLOW), "parsed"],
  ["latex", "1,000 nested \\frac", layered((v) => `\\frac{${v}}{2}`, DEEP), "PARSE_ERROR"],
  ["latex", "20 nested \\sqrt", wrapped("\\sqrt{", "2", "}", SHALLOW), "parsed"],
  ["latex", "1,000 nested \\sqrt", wrapped("\\sqrt{", "2", "}", DEEP), "PARSE_ERROR"],
  ["latex", "20 nested parens", wrapped("(", "x", ")", SHALLOW), "parsed"],
  ["latex", "1,000 nested parens", wrapped("(", "x", ")", DEEP), "PARSE_ERROR"],
  ["latex", "20 nested \\left(", wrapped("\\left(", "x", "\\right)", SHALLOW), "parsed"],
  ["latex", "1,000 nested \\left(", wrapped("\\left(", "x", "\\right)", DEEP), "PARSE_ERROR"],
  [
    "latex",
    "20 nested superscripts",
    `x${repeat("^{y", SHALLOW)}${repeat("}", SHALLOW)}`,
    "parsed",
  ],
  [
    "latex",
    "1,000 nested superscripts",
    `x${repeat("^{y", DEEP)}${repeat("}", DEEP)}`,
    "PARSE_ERROR",
  ],
  // Gem: ParseError at 20, SystemStackError at 100 and 300.
  ["latex", "20 unterminated braces", `${repeat("{", SHALLOW)}x`, "PARSE_ERROR"],
  ["latex", "1,000 unterminated braces", `${repeat("{", DEEP)}x`, "PARSE_ERROR"],
  // Gem: ParseError at 20, 100 and 300.
  ["latex", "1,000 unmatched closing braces", `x${repeat("}", DEEP)}`, "PARSE_ERROR"],
  // Gem: `\left(` with no `\right` parses. Trailing backslash: ParseError.
  ["latex", "\\left( never closed", "\\left(", "parsed"],
  ["latex", "trailing backslash", "\\", "PARSE_ERROR"],
  // Gem parses 300 of each (20.7s for `a`, 28.8s for `x `; the port ~0.8s).
  ["latex", "300 symbols", repeat("x ", 300), "parsed"],
  ["latex", "300 characters of one symbol", repeat("a", 300), "parsed"],
  // Gem: NUL parses. A lone surrogate is not representable in the gem's UTF-8
  // strings — the nearest input, the same three bytes as invalid UTF-8, is a
  // ParseError there — so this row pins the port's own behaviour: it parses,
  // and only `toUnicodemath` then refuses to encode it.
  ["latex", "NUL character", "x\u0000y", "parsed"],
  ["latex", "lone surrogate", "x\uD800y", "RENDER_ERROR"],

  // --- HTML. Gem: `<mrow>`/`<sup>` parse at 20-60, ParseError at 100 (the JSON
  // round trip's nesting-100 cap), SystemStackError at 300.
  ["html", "20 nested <mrow>", wrapped("<mrow>", "x", "</mrow>", SHALLOW), "parsed"],
  ["html", "100 nested <mrow>", wrapped("<mrow>", "x", "</mrow>", 100), "PARSE_ERROR"],
  ["html", "1,000 nested <mrow>", wrapped("<mrow>", "x", "</mrow>", DEEP), "PARSE_ERROR"],
  ["html", "20 nested <sup>", wrapped("<sup>", "x", "</sup>", SHALLOW), "parsed"],
  ["html", "100 nested <sup>", wrapped("<sup>", "x", "</sup>", 100), "PARSE_ERROR"],
  ["html", "1,000 nested <sup>", wrapped("<sup>", "x", "</sup>", DEEP), "PARSE_ERROR"],
  ["html", "1,000 nested parens", wrapped("(", "x", ")", DEEP), "PARSE_ERROR"],
  // Gem: ParseError at 20, 100; SystemStackError at 300.
  ["html", "20 unterminated <sup>", `${repeat("<sup>", SHALLOW)}x`, "PARSE_ERROR"],
  ["html", "1,000 unterminated <sup>", `${repeat("<sup>", DEEP)}x`, "PARSE_ERROR"],
  // Gem: ParseError at 20, 100 and 300.
  ["html", "1,000 unmatched </sup>", `x${repeat("</sup>", DEEP)}`, "PARSE_ERROR"],
  // Gem: 100 letters parse; 300 raise SystemStackError. The port refuses 300
  // with the JSON nesting message: a nesting-depth cutoff the gem also has, just
  // reached earlier than the gem's stack.
  ["html", "100 characters of one symbol", repeat("a", 100), "parsed"],
  ["html", "300 characters of one symbol", repeat("a", 300), "PARSE_ERROR"],
  // Gem: `<` and `<sup` are ParseErrors; NUL parses; `&#55296;` (a surrogate
  // code point) raises RangeError, wrapped as ParseError; "   " parses.
  ["html", "bare <", "<", "PARSE_ERROR"],
  ["html", "unfinished <sup", "<sup", "PARSE_ERROR"],
  ["html", "NUL character", "x\u0000y", "parsed"],
  ["html", "surrogate numeric entity", "&#55296;", "PARSE_ERROR"],
  ["html", "lone surrogate", "x\uD800y", "RENDER_ERROR"],
  ["html", "whitespace only", "   ", "RENDER_ERROR"],

  // --- UnicodeMath. Gem: parses at 20 (60 for `(` and `(…)/(…)`), SystemStackError
  // at 100. Port: parses at 20; the stack guard at 1000.
  ["unicodemath", "20 nested parens", wrapped("(", "x", ")", SHALLOW), "parsed"],
  ["unicodemath", "1,000 nested parens", wrapped("(", "x", ")", DEEP), "PARSE_ERROR"],
  ["unicodemath", "20 nested brackets", wrapped("[", "x", "]", SHALLOW), "parsed"],
  ["unicodemath", "1,000 nested brackets", wrapped("[", "x", "]", DEEP), "PARSE_ERROR"],
  ["unicodemath", "20 nested roots", wrapped("√(", "2", ")", SHALLOW), "parsed"],
  ["unicodemath", "1,000 nested roots", wrapped("√(", "2", ")", DEEP), "PARSE_ERROR"],
  ["unicodemath", "20 nested fractions", layered((v) => `(${v})/(2)`, SHALLOW), "parsed"],
  ["unicodemath", "1,000 nested fractions", layered((v) => `(${v})/(2)`, DEEP), "PARSE_ERROR"],
  // Gem: ParseError at 20 (`x^(y)^(y)…` is not a valid chain); SystemStackError at 100.
  [
    "unicodemath",
    "1,000 nested superscripts",
    `x${repeat("^(", DEEP)}y${repeat(")", DEEP)}`,
    "PARSE_ERROR",
  ],
  // Gem: ParseError at 20; SystemStackError at 100.
  ["unicodemath", "20 unterminated parens", `${repeat("(", SHALLOW)}x`, "PARSE_ERROR"],
  ["unicodemath", "1,000 unterminated parens", `${repeat("(", DEEP)}x`, "PARSE_ERROR"],
  // Gem: ParseError at 20, 100, 300.
  ["unicodemath", "1,000 unmatched closing parens", `x${repeat(")", DEEP)}`, "PARSE_ERROR"],
  // Gem parses 300 `a` (12s) and 100 `x ` (29.6s); 300 `x ` timed out past 60s.
  // The port takes ~1.4s and ~3.3s; sizes stay where the port is quick.
  ["unicodemath", "300 characters of one symbol", repeat("a", 300), "parsed"],
  ["unicodemath", "60 symbols", repeat("x ", 60), "parsed"],
  // Gem parses every input below. The port refuses the first three at the
  // transform, a rule family outside its slice; the fourth is refused by the
  // grammar in both. See the header comment.
  ["unicodemath", "NUL character", "x\u0000y", "PARSE_ERROR"],
  ["unicodemath", "trailing backslash", "\\", "PARSE_ERROR"],
  ["unicodemath", "unfinished <sup", "<sup", "PARSE_ERROR"],
  ["unicodemath", "lone surrogate", "x\uD800y", "PARSE_ERROR"],
  ["unicodemath", "NUL alone", "\u0000", "parsed"],
];

/**
 * Explicit, and the same 60 seconds for every row. Vitest's default is 5s, and
 * under host load the slowest rows here (UnicodeMath at a few hundred
 * characters) have run several times slower than the measured figures. Like
 * `SLOWEST_ALLOWED_MS`, this cannot interrupt a non-returning loop.
 */
const GRAMMAR_CASE_TIMEOUT_MS = 60_000;

describe("every LaTeX, HTML and UnicodeMath adversarial input reaches the outcome it is pinned to", () => {
  const seen = new Map<GrammarName, Outcome[]>();

  it.each(GRAMMAR_CASES)(
    "%s: %s",
    (grammar, label, input, expected) => {
      const started = performance.now();
      const outcome = outcomeOf(input, RENDERERS, PARSERS[grammar]);
      const elapsed = performance.now() - started;
      seen.set(grammar, [...(seen.get(grammar) ?? []), outcome]);
      expect(outcome).toBe(expected);
      expect(elapsed, `${grammar}: ${label} took ${Math.round(elapsed)}ms`).toBeLessThan(
        SLOWEST_ALLOWED_MS,
      );
    },
    GRAMMAR_CASE_TIMEOUT_MS,
  );

  it("exercised every case", () => {
    const total = [...seen.values()].reduce((sum, outcomes) => sum + outcomes.length, 0);
    expect(GRAMMAR_CASES.length).toBeGreaterThan(0);
    expect(total).toBe(GRAMMAR_CASES.length);
  });

  it("gives every grammar both a parse and a refusal, so none is carried by one shape", () => {
    for (const grammar of Object.keys(PARSERS) as GrammarName[]) {
      const outcomes = new Set(seen.get(grammar));
      expect(outcomes.has("parsed"), `${grammar} never parses`).toBe(true);
      expect(outcomes.has("PARSE_ERROR"), `${grammar} never refuses`).toBe(true);
    }
  });
});

describe("the new grammars refuse deep input through a guard that says which guard it was", () => {
  /** The message of the refusal, or `"parsed"`; a non-`ParseError` is rethrown. */
  function guardFor(grammar: GrammarName, input: string): string {
    try {
      PARSERS[grammar](input);
      return "parsed";
    } catch (error) {
      if (cleanErrorCode(error) !== "PARSE_ERROR") throw error;
      return (error as Error).message;
    }
  }

  const deepRows = GRAMMAR_CASES.filter(
    ([, label, , expected]) => expected === "PARSE_ERROR" && label.startsWith("1,000 nested"),
  );

  it(
    "refuses every 1,000-deep nesting row through the stack guard, not the depth cap",
    () => {
      // Driven off the table so a row that changes guard fails here. The HTML
      // rows at 1,000 come through the stack guard too: the JSON-nesting cap
      // (100) sits in the tree walk that runs *after* a parse, and 1,000
      // levels never finish the parse.
      expect(deepRows.length).toBeGreaterThan(0);
      for (const [grammar, label, input] of deepRows) {
        const message = guardFor(grammar, input);
        expect(message, `${grammar}: ${label}`).toBe(STACK_EXHAUSTED_MESSAGE);
        expect(message).not.toBe(DEPTH_LIMIT_MESSAGE);
      }
    },
    GRAMMAR_CASE_TIMEOUT_MS,
  );

  it(
    "refuses 100-deep HTML with the JSON nesting cap the gem also has",
    () => {
      for (const [grammar, label, input, expected] of GRAMMAR_CASES) {
        if (grammar !== "html" || expected !== "PARSE_ERROR" || !label.startsWith("100 ")) continue;
        expect(guardFor(grammar, input), label).toMatch(/nesting of 100 is too deep/);
      }
    },
    GRAMMAR_CASE_TIMEOUT_MS,
  );

  it(
    "never refuses any pinned row through MAX_DEPTH",
    () => {
      for (const [grammar, label, input, expected] of GRAMMAR_CASES) {
        if (expected !== "PARSE_ERROR") continue;
        expect(guardFor(grammar, input), `${grammar}: ${label}`).not.toBe(DEPTH_LIMIT_MESSAGE);
      }
    },
    GRAMMAR_CASE_TIMEOUT_MS,
  );
});
