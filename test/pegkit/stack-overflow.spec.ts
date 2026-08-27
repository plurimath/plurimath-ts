/**
 * Which engine failures count as an exhausted stack.
 *
 * `Atom.parse` converts these engine exceptions into a parser-stack failure.
 * It deliberately rethrows unrelated exceptions.
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
      "V8 regex compilation, Node 24 wording",
      new SyntaxError("Invalid regular expression: /[0-9]/uy: Maximum call stack size exceeded"),
    ],
    [
      // This shape escaped because V8 reported a SyntaxError rather than a
      // RangeError. Its reason already matched the shared overflow text.
      "V8 regex compilation, alternate wording",
      new SyntaxError("Invalid regular expression: /[0-9]/uy: Stack overflow"),
    ],
    [
      // V8 includes the failing regex in its message, so the predicate must not
      // hard-code `/[0-9]/uy`. This message is constructed, not observed; its
      // pattern is copied from the `symbol` capture in `symbolTextOrInteger`.
      "V8 regex compilation, a different failing literal",
      new SyntaxError(
        "Invalid regular expression: /[^\\[{(\\\\\\/@;:.,'\"|\\]})0-9a-zA-Z\\-><$%^&*_=+!`~\\t\\n\\v\\f\\r ?\u2112\u211b\u1455\u1450]/uy: Stack overflow",
      ),
    ],
  ])("recognises %s", (_label, error) => {
    expect(isStackOverflow(error)).toBe(true);
  });

  it.each([
    // Malformed patterns carry structural reasons and stay outside the overflow
    // classification. Sources containing overflow text prove that the classifier
    // checks the reason field rather than the whole message.
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
    // These reasons contain a broad matcher fragment but are not complete V8
    // overflow reasons, so the SyntaxError branch rejects them.
    [
      "a negated stack-overflow reason",
      new SyntaxError("Invalid regular expression: /[0-9]/uy: Not a stack overflow"),
    ],
    [
      "an extended stack-overflow reason",
      new SyntaxError("Invalid regular expression: /[0-9]/uy: Stack overflowed while parsing"),
    ],
    [
      "an unrelated maximum-call-stack reason",
      new SyntaxError(
        "Invalid regular expression: /[0-9]/uy: Maximum call stack setting is invalid",
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
