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
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string" && CLEAN_CODES.has(code) ? code : null;
}

type Outcome = "parsed" | "PARSE_ERROR" | "RENDER_ERROR";

/** Runs one input all the way to a clean outcome, or rethrows what it got. */
function outcomeOf(input: string): Outcome {
  let node: ReturnType<typeof parseAsciimath>;
  try {
    node = parseAsciimath(input);
  } catch (error) {
    const code = cleanErrorCode(error);
    if (code === null) throw error;
    return code as Outcome;
  }
  try {
    // Rendering is part of the outcome: a parse producing a model no renderer
    // can walk has moved the failure rather than prevented it, and the failure
    // still has to be typed.
    toAsciimath(node);
    toLatex(node);
    toMathml(node);
  } catch (error) {
    const code = cleanErrorCode(error);
    if (code === null) throw error;
    return code as Outcome;
  }
  return "parsed";
}

/**
 * Sizes cross every threshold this parser has while keeping the suite quick.
 * The parser is linear in input length (measured: 5,000 closing parens 1.96s,
 * 40,000 15.1s), so the large cases are the slow ones and sit just past the
 * interesting boundary rather than as large as possible.
 */
const CASES: ReadonlyArray<readonly [string, string]> = [
  ["nesting: 2,000 nested parens", `${"(".repeat(2000)}x${")".repeat(2000)}`],
  ["nesting: 2,000 nested sqrt", `${"sqrt(".repeat(2000)}2${")".repeat(2000)}`],
  ["nesting: 500 nested frac", `${"frac(".repeat(500)}1)(2${")".repeat(500)}`],
  ["fences: 5,000 unmatched open", `${"(".repeat(5000)}x`],
  ["fences: 2,000 unmatched close", `x${")".repeat(2000)}`],
  ["fences: alternating unmatched", "(x)) ((y) {: z"],
  ["tokens: 500 symbols", Array.from({ length: 500 }, () => "a").join(" ")],
  ["tokens: 5,000 symbols", Array.from({ length: 5000 }, () => "a").join(" ")],
  ["tokens: 5,000 digits, no spaces", "1".repeat(5000)],
  ["tokens: 2,000 superscripts", `x${"^y".repeat(2000)}`],
  ["tokens: 20,000 characters of one symbol", "a".repeat(20000)],
  ["whitespace only", "   "],
];

describe("every adversarial input reaches a clean outcome", () => {
  const outcomes = new Map<string, Outcome>();

  it.each(CASES)("%s", (label, input) => {
    // A hang fails here by timeout rather than by a flaky elapsed-time
    // threshold; the bound is the assertion.
    outcomes.set(label, outcomeOf(input));
  });

  it("exercised every case", () => {
    expect(CASES.length).toBeGreaterThan(0);
    expect(outcomes.size).toBe(CASES.length);
  });

  it("saw more than one outcome, so 'clean' is not passing on one trivial shape", () => {
    const seen = [...outcomes.values()];
    expect(seen).toContain("parsed");
    expect(seen).toContain("PARSE_ERROR");
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

describe("nesting past the cap is refused, and says so", () => {
  it("names the depth rather than failing as an ordinary syntax error", () => {
    let caught: unknown;
    try {
      parseAsciimath(`${"(".repeat(2000)}x${")".repeat(2000)}`);
    } catch (error) {
      caught = error;
    }
    expect(cleanErrorCode(caught)).toBe("PARSE_ERROR");
    expect((caught as Error).message).toMatch(/nested too deeply/);
  });

  it("still parses nesting the cap allows, so the cap is not refusing everything", () => {
    expect(outcomeOf(`${"(".repeat(100)}x${")".repeat(100)}`)).toBe("parsed");
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
 * renderer can walk. The gem raises `NoMethodError` on the same input, so a
 * typed `RenderError` is the porting-correct outcome rather than a defect —
 * but it is a *render*-time failure for input that parsed, which is worth
 * pinning explicitly rather than leaving inside the table above.
 */
describe("whitespace-only input fails at render, with a typed error", () => {
  it("parses, then refuses to render, and says which value it choked on", () => {
    expect(outcomeOf("   ")).toBe("RENDER_ERROR");
    expect(() => toAsciimath(parseAsciimath("   "))).toThrow(/cannot render the bare string/);
  });
});
