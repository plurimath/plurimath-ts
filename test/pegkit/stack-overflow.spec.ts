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
    ["V8 (Node, Chrome) call stack", new RangeError("Maximum call stack size exceeded")],
    // MDN's "too much recursion" reference page and WebKit bug 80797 both
    // quote Safari's wording with a trailing period — a distinct string from
    // V8's, which has none — see `STACK_OVERFLOW_MESSAGES`'s own comment.
    [
      "JavaScriptCore (Safari) wording, trailing period",
      new RangeError("Maximum call stack size exceeded."),
    ],
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
    // The bug a review found: the RangeError/InternalError branch used to
    // substring-match `/maximum call stack|stack overflow/i`, so a caller
    // (hostile, or merely unlucky) throwing either of these two — both real,
    // constructible `RangeError`s that are NOT V8's own exhausted-stack
    // message — was misclassified as genuine stack exhaustion. Neither is
    // one of the exact, measured whole messages `STACK_OVERFLOW_MESSAGES`
    // now requires (V8, Node 20.20.2/22.23.2/24.18.0: always exactly
    // "Maximum call stack size exceeded", measured 2026-09-23 — see the
    // constant's own comment in `src/pegkit/atom.ts`).
    ["a decoy naming 'stack overflow' with no engine wording", new RangeError("stack overflow")],
    [
      "a decoy extending V8's own wording with unrelated text",
      new RangeError("maximum call stack size exceeded while allocating a buffer"),
    ],
    // The truncated "stack size exceeded" entry this file used to carry as
    // JavaScriptCore's wording cited no source, is not in MDN's "too much
    // recursion" reference page or WebKit bug 80797 (both give Safari's full
    // wording, trailing period included — see `STACK_OVERFLOW_MESSAGES`'s own
    // comment), and nothing found suggests any engine emits it alone. Kept as
    // a negative case so a future substring-widening cannot resurrect it.
    [
      "the dropped, unsourced 'stack size exceeded' spelling",
      new RangeError("stack size exceeded"),
    ],
  ])("does not mistake %s for one", (_label, error) => {
    expect(isStackOverflow(error)).toBe(false);
  });
});
