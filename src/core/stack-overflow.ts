/**
 * Classifies an engine stack-overflow error. Parsers (pegkit) and the
 * format renderers both need it, and it lives in core so that a renderer
 * entry point does not pull the parser toolkit into its bundle
 * (scripts/gate-package.mjs checks this per subpath).
 */

/**
 * Cross-engine wording for recursion errors, matched as a COMPLETE message,
 * never a substring. V8 (Node, this package's only supported runtime —
 * `package.json` `engines.node`) was measured directly: node 20.20.2, 22.23.2
 * and 24.18.0, both on the main thread and inside a `worker_threads` worker
 * (what a vitest `threads` pool runs tests in), every one throwing
 * `RangeError: Maximum call stack size exceeded` for genuine unbounded
 * recursion — the same, exact, whole message on all six combinations,
 * 2026-09-23. Those three patch versions were measured LOCALLY, via `mise`;
 * CI's own matrix (`.github/workflows/ci.yml`) pins only the majors 20/22/24
 * and resolves whatever patch is current at each run, so this is evidence of
 * the wording, not a promise CI runs these exact builds.
 *
 * JavaScriptCore (Safari) and SpiderMonkey (Firefox) were not reachable to
 * measure from this checkout (this package ships no browser build today), but
 * their wording is DOCUMENTED rather than carried forward unsourced: MDN's
 * "too much recursion" reference page (Message section, fetched 2026-09-23)
 * gives, verbatim —
 *
 * ```
 * RangeError: Maximum call stack size exceeded (Chrome)
 * InternalError: too much recursion (Firefox)
 * RangeError: Maximum call stack size exceeded. (Safari)
 * ```
 *
 * — and independently, WebKit bug 80797 quotes the same Safari wording,
 * TRAILING PERIOD included: `"RangeError: Maximum call stack size
 * exceeded."`. That period makes it a distinct string from V8's, which has
 * none — measured directly above — so it needs its own set entry, not a
 * shared one. The earlier "stack size exceeded" entry this replaces cited no
 * source and does not appear in either document; nothing found suggests any
 * engine ever emits that shorter string on its own, so it is dropped rather
 * than carried forward. MDN's page also confirms error TYPE per engine —
 * `RangeError` for Chrome and Safari, `InternalError` for Firefox — matching
 * the class check this file already applies below (`recursionClass`) before
 * ever consulting this set.
 *
 * A substring match here is the bug this set replaces: `new
 * RangeError("stack overflow")` and `new RangeError("maximum call stack size
 * exceeded while allocating a buffer")` are both real shapes a hostile or
 * merely unlucky caller can construct, and a `/maximum call stack|stack
 * overflow/i` test read either as genuine engine stack exhaustion. Neither is
 * a message any of the three documented engines ever emits for a real
 * overflow, so exact equality — case-folded, since the JavaScriptCore/
 * SpiderMonkey wording above was not verified against a live engine's
 * capitalisation — excludes both while still recognising every message this
 * set names.
 */
const STACK_OVERFLOW_MESSAGES: ReadonlySet<string> = new Set([
  "maximum call stack size exceeded", // V8 (Node, Chrome) — measured, see above
  "maximum call stack size exceeded.", // JavaScriptCore (Safari) — MDN + WebKit bug 80797, trailing period
  "too much recursion", // SpiderMonkey (Firefox) — MDN, not measured here
]);

/** Whether `message` is one of the complete, known engine overflow messages. */
function isStackOverflowMessage(message: string): boolean {
  return STACK_OVERFLOW_MESSAGES.has(message.toLowerCase());
}

/**
 * Regex-compilation `SyntaxError` needs a stricter rule because it can also
 * expose a malformed grammar. These are the complete V8 reasons observed for
 * an exhausted stack. Anchoring rejects longer synthetic reasons, but it cannot
 * predict or recognise a future V8 wording.
 */
const V8_REGEX_STACK_OVERFLOW_REASON = /^(?:maximum call stack size exceeded|stack overflow)$/i;

/**
 * V8 reports a failed regex compilation as
 * `Invalid regular expression: /<source>/<flags>: <reason>`, echoing the
 * pattern back. The reason field identifies the failure, so it is tested
 * separately: a search across the whole message matches a malformed pattern whose
 * own source contains the words (`new RegExp("Stack overflow(")` reports
 * `Unterminated group` on a pattern that reads "Stack overflow"), which would
 * convert a real grammar bug into a reported parse failure.
 */
const REGEX_COMPILE_MESSAGE = /^Invalid regular expression: \/[\s\S]*\/[a-z]*: ([\s\S]+)$/;

/** Matches a V8 regex-compilation message with one of the observed overflow reasons. */
function isRegexCompileOverflow(message: string): boolean {
  const reason = REGEX_COMPILE_MESSAGE.exec(message)?.[1];
  return reason !== undefined && V8_REGEX_STACK_OVERFLOW_REASON.test(reason);
}

/**
 * The classes those engines throw. V8 and JavaScriptCore use `RangeError`;
 * **SpiderMonkey uses `InternalError`**, which is not a `RangeError` and is not
 * a standard global — so an `instanceof RangeError` test excludes Firefox
 * before the message is ever consulted, leaving the regex's "too much
 * recursion" branch unreachable there and a browser consumer receiving the
 * raw engine exception instead of a parser-stack failure.
 *
 * V8 has a separate shape. When the stack is already
 * exhausted, compiling a regex literal fails with a `SyntaxError` — not a
 * `RangeError` — reading "Invalid regular expression: /[0-9]/uy: <reason>".
 * Node 24.18.0 / V8 13.6 emitted "Maximum call stack size exceeded" in the
 * reported regression; "Stack overflow" is the alternate observed reason.
 * Both reasons matched the RangeError/InternalError text this file used to
 * check with a substring regex (now `STACK_OVERFLOW_MESSAGES`, an exact-match
 * set). The earlier classifier rejected the error because a `SyntaxError` is
 * neither a `RangeError` nor an `InternalError`.
 *
 * V8 includes the failing regex in the message, so the classifier accepts the
 * message shape rather than one grammar literal. It then checks the complete
 * reason with the anchored V8 matcher above. This keeps overflow words in the
 * echoed regex source, longer synthetic reasons, and structural failure reasons
 * from satisfying the `SyntaxError` branch.
 */
export function isStackOverflow(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error instanceof SyntaxError) return isRegexCompileOverflow(error.message);
  const recursionClass = error instanceof RangeError || error.name === "InternalError";
  return recursionClass && isStackOverflowMessage(error.message);
}
