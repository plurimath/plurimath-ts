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
      // being compiled. A second spelling was observed in the same sweep — the
      // text rule's character class — so the predicate must match the SHAPE,
      // not the `/[0-9]/uy` literal. Pinning only the first would let a later
      // narrowing reintroduce the raw throw while this test still passed.
      "V8 regex compilation, a different failing literal",
      new SyntaxError(
        "Invalid regular expression: /[^\\[{(\\\\\\/@;:.,'\"|\\]})0-9a-zA-Z]/uy: Stack overflow",
      ),
    ],
  ])("recognises %s", (_label, error) => {
    expect(isStackOverflow(error)).toBe(true);
  });

  it.each([
    // A genuinely malformed pattern reports what is wrong with it, never
    // "Stack overflow" — so admitting SyntaxError cannot swallow a grammar bug,
    // which is the reason the class gate exists at all.
    [
      "a real malformed pattern",
      new SyntaxError("Invalid regular expression: /(/: Unterminated group"),
    ],
    ["an unrelated SyntaxError", new SyntaxError("Unexpected token")],
    ["a RangeError that is not recursion", new RangeError("Invalid array length")],
    ["an unrelated Error whose text matches", new Error("maximum call stack")],
    ["a non-Error", "Maximum call stack size exceeded"],
  ])("does not mistake %s for one", (_label, error) => {
    expect(isStackOverflow(error)).toBe(false);
  });
});
