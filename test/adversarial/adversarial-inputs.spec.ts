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
import { toLatex } from "../../src/formats/latex/renderer";
import { toMathml } from "../../src/formats/mathml/renderer";
import { DEPTH_LIMIT_MESSAGE, STACK_EXHAUSTED_MESSAGE } from "../../src/pegkit/atom";

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

const RENDERERS: ReadonlyArray<readonly [string, (node: ParsedFormula) => string]> = [
  ["toAsciimath", toAsciimath],
  ["toLatex", toLatex],
  ["toMathml", toMathml],
];

/** Runs one input all the way to a clean outcome, or rethrows what it got. */
function outcomeOf(input: string, renderers: typeof RENDERERS = RENDERERS): Outcome {
  let node: ParsedFormula;
  try {
    node = parseAsciimath(input);
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

describe("every adversarial input reaches the clean outcome it is pinned to", () => {
  const seen: Outcome[] = [];

  it.each(CASES)("%s", (_label, input, expected) => {
    // A hang fails here by timeout rather than by a flaky elapsed-time
    // threshold; the bound is the assertion.
    const outcome = outcomeOf(input);
    seen.push(outcome);
    expect(outcome).toBe(expected);
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
  // The regression test for the shared-`try` bug. While all three renderers sat
  // in one `try`, a typed `RenderError` from the first returned before the
  // others ran, so an untyped throw from the second or third was never seen.
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
