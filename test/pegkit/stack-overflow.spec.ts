/**
 * Which engine failures count as an exhausted stack.
 *
 * The parser's contract is that every failure leaves it as a typed
 * `ParseError`; message text is never API. That contract was broken for one
 * shape, and this pins all of them.
 */

import { describe, expect, it } from "vitest";
import { isStackOverflow } from "../../src/pegkit/atom";

/** SpiderMonkey's class is not a standard global, so it is faked by name. */
function internalError(message: string): Error {
  const error = new Error(message);
  error.name = "InternalError";
  return error;
}

describe("engine stack-overflow shapes", () => {
  it.each([
    ["V8 / JavaScriptCore call stack", new RangeError("Maximum call stack size exceeded")],
    ["JavaScriptCore wording", new RangeError("stack size exceeded")],
    ["SpiderMonkey", internalError("too much recursion")],
    [
      // The shape that escaped. With the stack already exhausted, V8 cannot
      // COMPILE a regex literal, and reports that as a SyntaxError — not a
      // RangeError — whose message is neither "maximum call stack" nor "too
      // much recursion". It left `parseAsciimath` raw and untyped. Measured at
      // nesting depth 73 over twelve cold processes: one untyped SyntaxError,
      // two typed ParseError, nine clean parses.
      "V8 regex compilation under an exhausted stack",
      new SyntaxError("Invalid regular expression: /[0-9]/uy: Stack overflow"),
    ],
    [
      // V8 names the failing regex, so the message varies with which one was
      // being compiled: the predicate must match the SHAPE, not the `/[0-9]/uy`
      // literal. Pinning only the first would let a later narrowing reintroduce
      // the raw throw while this test still passed. This second message is
      // CONSTRUCTED, not observed — the pattern is the `symbol` capture's
      // character class in `symbolTextOrInteger` (`grammar.ts`), read off the
      // grammar and compiled here so the literal is one V8 could actually print.
      "V8 regex compilation, a different failing literal",
      new SyntaxError(
        "Invalid regular expression: /[^\\[{(\\\\\\/@;:.,'\"|\\]})0-9a-zA-Z\\-><$%^&*_=+!`~\\t\\n\\v\\f\\r ?\u2112\u211b\u1455\u1450]/uy: Stack overflow",
      ),
    ],
  ])("recognises %s", (_label, error) => {
    expect(isStackOverflow(error)).toBe(true);
  });

  it.each([
    // A genuinely malformed pattern gives a structural reason, so admitting
    // SyntaxError cannot swallow a grammar bug. The pattern's own SOURCE may
    // still contain the words: V8 echoes it back, so a whole-message search
    // would match these three and convert a real defect into a parse failure.
    [
      "a real malformed pattern",
      new SyntaxError("Invalid regular expression: /(/: Unterminated group"),
    ],
    [
      "a malformed pattern whose source reads 'Stack overflow'",
      new SyntaxError("Invalid regular expression: /Stack overflow(/: Unterminated group"),
    ],
    [
      "a malformed character class whose source reads 'Stack overflow'",
      new SyntaxError(
        "Invalid regular expression: /[Stack overflow/: Unterminated character class",
      ),
    ],
    ["an unrelated SyntaxError", new SyntaxError("Unexpected token")],
    ["a RangeError that is not recursion", new RangeError("Invalid array length")],
    ["an unrelated Error whose text matches", new Error("maximum call stack")],
    ["a non-Error", "Maximum call stack size exceeded"],
  ])("does not mistake %s for one", (_label, error) => {
    expect(isStackOverflow(error)).toBe(false);
  });
});
