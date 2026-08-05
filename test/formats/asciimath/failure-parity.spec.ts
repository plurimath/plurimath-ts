/**
 * Failure-path parity: what the gem *refuses*, and where a refusal points.
 *
 * The corpus records only successes, so a port that returns something plausible
 * wherever the gem raises passes every other test in this repository. Two pegkit
 * failure-position bugs already survived a 23-test conformance suite that only
 * checked what parses (`.codex-context/STATUS.md`), and `ParseError.index` is
 * public contract (ARCHITECTURE.md §5). This file is the other half.
 *
 * ## AsciiMath is far more permissive than it looks
 *
 * Nothing here is reasoned out. A candidate list of 156 malformed or truncated
 * inputs was swept against the oracle and the gem's answer decided which side
 * each one lands on:
 *
 *   BUNDLE_GEMFILE=~/ruby_gems/plurimath-oracle/Gemfile mise x -- \
 *     bundle exec ruby probe-failures.rb candidates.json
 *
 * against plurimath 0.11.6 at 00c52783877b38f6b8e6e109f1803f96bb34fc62. Each
 * candidate was run three ways: `Plurimath::Math.parse(input, :asciimath)`,
 * `Asciimath::Parser.new(input).text`, and `Asciimath::Parse.new.parse(text)`.
 *
 * **26 of the 156 are rejected; 130 are accepted.** The public boundary and the
 * Parslet layer agreed on every one of the 156, so `Math::ParseError` is raised
 * exactly when the grammar fails and never for any other reason here.
 *
 * The accepted ones are the point of the sweep. `x^`, `(a`, `a)`, `frac(a`,
 * `text(`, `sqrt(`, `root(3)(`, `"`, `{:`, `))))`, a lone `~`, `$` or `?` and a
 * bare `€` all parse. The rejections cluster almost entirely on **one** rule:
 * an unsatisfied `frac`, i.e. a solidus with nothing usable on one side. The
 * three that are not are a lone backtick, a lone `right`, and a `left(` group
 * whose `right` has no closing paren.
 *
 * ## The wider sweep behind "no new divergence"
 *
 * The 156 are a curated list; to check that they are not also a *lucky* list,
 * every string of length 1..3 over the structure-heavy alphabet
 * `{ } ( ) [ ] : | / ^ _ , " x 1 <space>` — 4,368 inputs — was run through the
 * gem the same way and classified (`sweep.rb`, `sweep-ts.ts`):
 *
 *   identical verdict and tree                              4,368
 *   gem accepts, this port rejects                              0
 *   gem REJECTS, this port ACCEPTS                              0
 *   tree differs, in any way at all                             0
 *
 * That is the whole space: every input agrees on both the verdict and the tree.
 * It was not always so — the sweep first found 1,434 inputs the gem accepts and
 * this port rejected, and 24 whose tree differed, both of them pegkit gaps
 * (`consume_all` and the empty named repetition). Both are now implemented, and
 * the eighteen candidates below that used to sit in those classes are named in
 * `FORMER_DIVERGENCES` so a regression cannot go quiet.
 * Preprocessing was re-checked on all 4,368 as a side effect and agreed.
 *
 * A second, seeded sweep of 1,500 LONGER inputs (4-26 characters, over the same
 * alphabet plus whole keywords — `sweep2.rb`, `sweep2-ts.ts`) says the same:
 * 1,500 of 1,500 identical. It was run because length 1-3 barely exercises the
 * packrat cache being reached at one position in both `consume_all` modes, and
 * it found both divergence classes independently on the pre-fix code (548
 * rejected, 11 trees differing) before finding none after.
 *
 * ## Positions: what the gem exposes, measured
 *
 * The gem exposes **no usable failure position at all**, at either layer:
 *
 * 1. `Plurimath::Math.parse` rescues `StandardError` and re-raises
 *    `Math::ParseError.new(text, type)` with `cause: nil` (`math.rb:43-50`).
 *    Measured on all 26 rejections: `e.cause` is `nil`, and the error does not
 *    respond to `parse_failure_cause`. It carries the input text and the format
 *    and nothing else.
 * 2. Underneath, `Parslet::ParseFailed#parse_failure_cause.pos.charpos` is
 *    **0 for all 26**, and the message is byte-identical for all 26 —
 *    "Expected one of [...] at line 1 char 1." Parslet's reporter blames the
 *    root atom, which for this grammar is always `expression` at offset 0.
 *
 * A per-input position exists only by walking `Cause#children` recursively (up
 * to 120,965 nodes for one of these inputs) and taking the deepest offset. That
 * is Parslet's internal bookkeeping, not an interface, and it disagrees with
 * this port on 3 of the 26 anyway.
 *
 * So `ParseError.index` cannot mean "what the gem said". It is defined here,
 * and this file is what defines it:
 *
 *   **`ParseError.index` is the offset, in the ORIGINAL input, of the first
 *   code unit the parser could not consume.**
 *
 * Two consequences the tests below pin:
 *
 * - It is a UTF-16 code-unit offset into the string the caller passed, so it
 *   goes through the `SourceMap` that `preprocess` returns. `{:` → `ℒ` shortens
 *   the text by one unit per rewrite, so a failure sitting after any rewrite has
 *   a *different* number before and after the map — 11 of the 26 rejections do,
 *   and they are what separates a correct implementation from a plausible one.
 * - For this grammar it is always `result.pos` and never pegkit's `maxPos`:
 *   `expression`'s fifth alternative is `str("")`, which always succeeds, so the
 *   root never hard-fails. Verified by driving `Atom#apply` directly on all 26 —
 *   `result.ok` was true every time, with `result.pos < input.length`.
 */

import { describe, expect, it } from "vitest";
import { ParseError } from "../../../src/core/errors";
import { createAsciimathGrammar } from "../../../src/formats/asciimath/grammar";
import { preprocess } from "../../../src/formats/asciimath/preprocess";
import { ParseFailed, type ParseValue, Slice } from "../../../src/pegkit/index";
import type { YamlValue } from "../../core/corpus-yaml";

const grammar = createAsciimathGrammar();

/**
 * Control characters and the no-break space as code points, never as literal
 * bytes in the source. A scripted edit has put raw control bytes into a file in
 * this repository three times (`.codex-context/STATUS.md`), and a literal
 * no-break space in a table is invisible to a reviewer.
 */
const TAB = String.fromCodePoint(0x09);
const LINE_FEED = String.fromCodePoint(0x0a);
const CARRIAGE_RETURN = String.fromCodePoint(0x0d);
const NO_BREAK_SPACE = String.fromCodePoint(0xa0);
/** ` \t\n\r ` — every Ruby-whitespace character that is not a plain space. */
const MIXED_SPACE = ` ${TAB}${LINE_FEED}${CARRIAGE_RETURN} `;

/** Slices flattened to their text, as the corpus generator serializes them. */
function plain(value: ParseValue): YamlValue {
  if (value === null) return null;
  if (value instanceof Slice) return value.text;
  if (Array.isArray(value)) return value.map(plain);
  const result: Record<string, YamlValue> = {};
  for (const [key, nested] of Object.entries(value)) result[key] = plain(nested);
  return result;
}

/**
 * The whole pipeline, from the caller's string to a typed error: preprocess,
 * parse, and map any failure position back through the `SourceMap`.
 *
 * This is deliberately the *only* composition of the three published pieces
 * that satisfies the contract above, and it is written here rather than in
 * `src/` because the AsciiMath format entry point is a later item — TODO 4 owns
 * `grammar.ts` and `preprocess.ts`, and `parseAsciimath` takes already-
 * preprocessed text on purpose. When that entry point lands it must do exactly
 * this, and this helper should be deleted in favour of calling it.
 */
function parseInput(input: string): YamlValue {
  const { text, map } = preprocess(input);
  try {
    return plain(grammar.root.parse(text));
  } catch (error) {
    if (error instanceof ParseFailed) {
      throw new ParseError(error.message, input, "asciimath", map.toOriginal(error.index));
    }
    throw error;
  }
}

/** The `ParseError` a rejected input produces, or `null` if it parsed. */
function rejectionOf(input: string): ParseError | null {
  try {
    parseInput(input);
    return null;
  } catch (error) {
    if (error instanceof ParseError) return error;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// The candidate list, and the gem's verdict on each.
//
// Committed in full so the next person can see what was *probed*, not only what
// survived. Every "accepts" here is a case where AsciiMath is more permissive
// than it looks, and every one of them would be a silent divergence if this
// port started rejecting it.
//
// Classes covered: empty and whitespace-only input; unbalanced fences of each
// kind; a bare preprocessing token of each kind; incomplete power and subscript;
// incomplete frac and root; an unclosed quote; trailing operators; lone
// operators; unknown symbols; and a failure sitting after a length-changing
// rewrite. Malformed entities are **not applicable**: AsciiMath does no entity
// decoding at all, so there is no malformed-entity input to write. That class
// binds the LaTeX and HTML parsers in P3, which do decode entities.
// ---------------------------------------------------------------------------

type Verdict = "accepts" | "rejects";
type Candidate = readonly [id: string, input: string, gem: Verdict];

const CANDIDATES: readonly Candidate[] = [
  ["empty", "", "accepts"],
  ["space-one", " ", "accepts"],
  ["space-many", "   ", "accepts"],
  ["space-tab", TAB, "accepts"],
  ["space-newline", LINE_FEED, "accepts"],
  ["space-mixed", MIXED_SPACE, "accepts"],
  ["fence-lparen", "(", "accepts"],
  ["fence-rparen", ")", "accepts"],
  ["fence-lparen-a", "(a", "accepts"],
  ["fence-a-rparen", "a)", "accepts"],
  ["fence-lbracket", "[", "accepts"],
  ["fence-rbracket", "]", "accepts"],
  ["fence-lbracket-a", "[a", "accepts"],
  ["fence-a-rbracket", "a]", "accepts"],
  ["fence-lbrace", "{", "accepts"],
  ["fence-rbrace", "}", "accepts"],
  ["fence-lbrace-a", "{a", "accepts"],
  ["fence-a-rbrace", "a}", "accepts"],
  ["fence-double-open", "((a)", "accepts"],
  ["fence-double-close", "(a))", "accepts"],
  ["fence-cross-1", "[a)", "accepts"],
  ["fence-cross-2", "(a]", "accepts"],
  ["fence-pipe-one", "|", "accepts"],
  ["fence-pipe-two", "||", "accepts"],
  ["fence-pipe-a", "|a", "accepts"],
  ["fence-a-pipe", "a|", "accepts"],
  ["fence-trailing-rparen", "a b )", "accepts"],
  ["fence-rparen-x", ")x", "accepts"],
  ["fence-2-rparen", "2)", "accepts"],
  ["fence-nested-open", "((((", "accepts"],
  ["fence-nested-close", "))))", "accepts"],
  ["prep-brace-open", "{:", "accepts"],
  ["prep-brace-close", ":}", "accepts"],
  ["prep-paren-open", "(:", "accepts"],
  ["prep-paren-close", ":)", "accepts"],
  ["prep-pipe-open", "|:", "accepts"],
  ["prep-pipe-close", ":|", "accepts"],
  ["prep-brace-open-x", "{: x", "accepts"],
  ["prep-x-brace-close", "x :}", "accepts"],
  ["prep-brace-pair", "{:x:}", "accepts"],
  ["prep-paren-pair", "(:x:)", "accepts"],
  ["prep-pipe-pair", "|:x:|", "accepts"],
  ["power-bare", "^", "accepts"],
  ["power-trailing", "x^", "accepts"],
  ["power-double", "x^^", "accepts"],
  ["power-triple", "x^^^", "accepts"],
  ["power-leading", "^x", "accepts"],
  ["power-repeat", "x^2^", "accepts"],
  ["power-empty-both", "^^", "accepts"],
  ["sub-bare", "_", "accepts"],
  ["sub-trailing", "x_", "accepts"],
  ["sub-double", "x__", "accepts"],
  ["sub-leading", "_x", "accepts"],
  ["sub-repeat", "x_1_", "accepts"],
  ["sub-power", "x_^", "accepts"],
  ["power-sub", "x^_", "accepts"],
  ["subsup-trailing", "x_1^", "accepts"],
  ["subsup-both-empty", "x_^2", "accepts"],
  ["frac-trailing", "a/", "rejects"],
  ["frac-leading", "/b", "rejects"],
  ["frac-bare", "/", "rejects"],
  ["frac-double-slash", "//", "accepts"],
  ["frac-a-double", "a//", "accepts"],
  ["frac-double-b", "//b", "accepts"],
  ["frac-chain-trailing", "a/b/", "rejects"],
  ["frac-triple-slash", "///", "rejects"],
  ["frac-space-trailing", "a/ ", "rejects"],
  ["frac-space-leading", " /a", "rejects"],
  ["frac-1-trailing", "1/", "rejects"],
  ["frac-leading-1", "/1", "rejects"],
  ["frac-paren-trailing", "(a)/", "rejects"],
  ["frac-fn-name", "frac", "accepts"],
  ["frac-fn-open", "frac(", "accepts"],
  ["frac-fn-a", "frac(a", "accepts"],
  ["frac-fn-ab", "frac(a)(", "accepts"],
  ["root-name", "root", "accepts"],
  ["root-open", "root(", "accepts"],
  ["root-empty", "root()", "accepts"],
  ["root-one-arg", "root(3)", "accepts"],
  ["root-second-open", "root(3)(", "accepts"],
  ["sqrt-name", "sqrt", "accepts"],
  ["sqrt-open", "sqrt(", "accepts"],
  ["sqrt-empty", "sqrt()", "accepts"],
  ["quote-open", '"', "accepts"],
  ["quote-open-a", '"a', "accepts"],
  ["quote-closed", '"a"', "accepts"],
  ["quote-triple", '"""', "accepts"],
  ["quote-empty", '""', "accepts"],
  ["text-name", "text", "accepts"],
  ["text-open", "text(", "accepts"],
  ["text-open-a", "text(a", "accepts"],
  ["text-empty", "text()", "accepts"],
  ["op-plus-trailing", "a+", "accepts"],
  ["op-plus-leading", "+a", "accepts"],
  ["op-plus-lone", "+", "accepts"],
  ["op-minus-lone", "-", "accepts"],
  ["op-minus-trailing", "a-", "accepts"],
  ["op-star-lone", "*", "accepts"],
  ["op-star-trailing", "a*", "accepts"],
  ["op-equals-lone", "=", "accepts"],
  ["op-equals-trailing", "a=", "accepts"],
  ["op-lt-lone", "<", "accepts"],
  ["op-gt-lone", ">", "accepts"],
  ["op-bang-lone", "!", "accepts"],
  ["op-amp-lone", "&", "accepts"],
  ["op-percent-lone", "%", "accepts"],
  ["op-at-lone", "@", "accepts"],
  ["op-semicolon-lone", ";", "accepts"],
  ["op-colon-lone", ":", "accepts"],
  ["op-apostrophe-lone", "'", "accepts"],
  ["op-backtick-lone", "`", "rejects"],
  ["op-tilde-lone", "~", "accepts"],
  ["op-dollar-lone", "$", "accepts"],
  ["op-question-lone", "?", "accepts"],
  ["op-comma-lone", ",", "accepts"],
  ["op-dot-lone", ".", "accepts"],
  ["op-backslash-lone", "\\", "accepts"],
  ["op-xx-trailing", "a xx", "accepts"],
  ["op-xx-lone", "xx", "accepts"],
  ["op-mod-trailing", "a mod", "accepts"],
  ["op-mod-lone", "mod", "accepts"],
  ["op-mod-leading", "mod b", "accepts"],
  ["unknown-section", "§", "accepts"],
  ["unknown-eacute", "é", "accepts"],
  ["unknown-euro", "€", "accepts"],
  ["unknown-snowman", "☃", "accepts"],
  ["unknown-cjk", "字", "accepts"],
  ["unknown-astral", "𝑥", "accepts"],
  ["unknown-nbsp", NO_BREAK_SPACE, "accepts"],
  ["kw-left-lone", "left", "accepts"],
  ["kw-right-lone", "right", "rejects"],
  ["kw-left-open", "left(", "accepts"],
  ["kw-left-x", "left(x", "accepts"],
  ["kw-left-x-right", "left(x right", "rejects"],
  ["kw-color-lone", "color", "accepts"],
  ["kw-color-open", "color(", "accepts"],
  ["kw-color-red", "color(red)", "accepts"],
  ["kw-norm-lone", "norm", "accepts"],
  ["kw-norm-open", "norm[[", "accepts"],
  ["kw-table-partial", "[[a]", "accepts"],
  ["kw-table-ok", "[[a]]", "accepts"],
  ["prep-after-brace-frac", "{:a/", "rejects"],
  ["prep-after-brace-pair-frac", "{:x:}a/", "rejects"],
  ["prep-after-paren-frac", "(:a/", "rejects"],
  ["prep-after-pipe-frac", "|:a/", "rejects"],
  ["prep-after-two-braces-frac", "{:{:a/", "rejects"],
  ["prep-after-brace-pair-slash-b", "{:a:}/b", "accepts"],
  ["prep-after-paren-pair-frac", "(:x:)y/", "rejects"],
  ["prep-after-pipe-pair-frac", "|:x:|y/", "rejects"],
  ["prep-brace-frac-leading", "{:/b", "accepts"],
  ["prep-mixed-frac", "{:a:}(:b:)c/", "rejects"],
  ["prep-astral-frac", "{:𝑥:}a/", "rejects"],
  ["prep-brace-trailing-frac", "sum_(i=1)^n i {:a/", "rejects"],
  ["prep-pipe-close-frac", "x:|y/", "rejects"],
  ["prep-brace-close-frac", "x:}y/", "rejects"],
  ["prep-paren-close-frac", "x:)y/", "rejects"],
];

/**
 * The 26 the gem rejects, with the position this port reports.
 *
 * `preprocessedIndex` is what `ParseFailed` carries — an offset into
 * `Asciimath::Parser#text`. `index` is that offset mapped back through the
 * `SourceMap`, and is what `ParseError` carries. `remainder` is the rest of the
 * ORIGINAL input from `index` on: it is the same claim as `index` stated in a
 * form a reviewer can check without counting, and an off-by-one breaks it.
 */
type Rejection = readonly [
  id: string,
  preprocessed: string,
  preprocessedIndex: number,
  index: number,
  remainder: string,
];

const REJECTIONS: readonly Rejection[] = [
  ["frac-trailing", "a/", 1, 1, "/"],
  ["frac-leading", "/b", 0, 0, "/b"],
  ["frac-bare", "/", 0, 0, "/"],
  ["frac-chain-trailing", "a/b/", 3, 3, "/"],
  ["frac-triple-slash", "///", 2, 2, "/"],
  ["frac-space-trailing", "a/ ", 1, 1, "/ "],
  ["frac-space-leading", " /a", 1, 1, "/a"],
  ["frac-1-trailing", "1/", 1, 1, "/"],
  ["frac-leading-1", "/1", 0, 0, "/1"],
  ["frac-paren-trailing", "(a)/", 3, 3, "/"],
  ["op-backtick-lone", "`", 0, 0, "`"],
  ["kw-right-lone", "right", 0, 0, "right"],
  ["kw-left-x-right", "left(x right", 7, 7, "right"],
  // Below here every input contains a length-changing rewrite BEFORE the
  // failure, so `index` and `preprocessedIndex` differ. Reporting the raw
  // parser offset would point at the wrong character in the caller's string.
  ["prep-after-brace-frac", "ℒa/", 2, 3, "/"],
  ["prep-after-brace-pair-frac", "ℒxℛa/", 4, 6, "/"],
  ["prep-after-paren-frac", "ᑕa/", 2, 3, "/"],
  ["prep-after-pipe-frac", "|a/", 2, 3, "/"],
  ["prep-after-two-braces-frac", "ℒℒa/", 3, 5, "/"],
  ["prep-after-paren-pair-frac", "ᑕxᑐy/", 4, 6, "/"],
  ["prep-after-pipe-pair-frac", "|x|y/", 4, 6, "/"],
  ["prep-mixed-frac", "ℒaℛᑕbᑐc/", 7, 11, "/"],
  // Two rewrites and an astral character: the map must keep both UTF-16 units
  // of `𝑥` distinct while still absorbing the two digraphs.
  ["prep-astral-frac", "ℒ𝑥ℛa/", 5, 7, "/"],
  ["prep-brace-trailing-frac", "sum_(i=1)^n i ℒa/", 16, 17, "/"],
  ["prep-pipe-close-frac", "x|y/", 3, 4, "/"],
  // The failure lands ON a rewritten digraph rather than after one, so the
  // reported offset is the digraph's first character, not its second.
  ["prep-brace-close-frac", "xℛy/", 1, 1, ":}y/"],
  ["prep-paren-close-frac", "xᑐy/", 1, 1, ":)y/"],
];

/**
 * The 130 the gem accepts, with the tree Parslet produced, verbatim JSON from
 * the same run. Pasted rather than hand-shaped, so a reviewer can diff it
 * against a fresh probe.
 */
type Acceptance = readonly [id: string, preprocessed: string, gemTree: string];

const ACCEPTANCES: readonly Acceptance[] = [
  ["empty", "", '""'],
  ["space-one", " ", '{"expr":" "}'],
  ["space-many", "   ", '{"expr":{"expr":" "}}'],
  ["space-tab", TAB, '{"expr":"\\t"}'],
  ["space-newline", LINE_FEED, '{"expr":"\\n"}'],
  ["space-mixed", MIXED_SPACE, '{"expr":{"expr":{"expr":" "}}}'],
  [
    "fence-lparen",
    "(",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":"","rparen":null}}}}',
  ],
  ["fence-rparen", ")", '{"expr":[{"rparen":")"}]}'],
  [
    "fence-lparen-a",
    "(a",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"symbol":"a"}}},"rparen":null}}}}',
  ],
  ["fence-a-rparen", "a)", '{"expr":{"sequence":{"symbol":"a"},"expr":[{"rparen":")"}]}}'],
  [
    "fence-lbracket",
    "[",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"[","expr":"","rparen":null}}}}',
  ],
  ["fence-rbracket", "]", '{"expr":[{"rparen":"]"}]}'],
  [
    "fence-lbracket-a",
    "[a",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"[","expr":{"expr":{"sequence":{"symbol":"a"}}},"rparen":null}}}}',
  ],
  ["fence-a-rbracket", "a]", '{"expr":{"sequence":{"symbol":"a"},"expr":[{"rparen":"]"}]}}'],
  [
    "fence-lbrace",
    "{",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"{","expr":"","rparen":null}}}}',
  ],
  ["fence-rbrace", "}", '{"expr":[{"rparen":"}"}]}'],
  [
    "fence-lbrace-a",
    "{a",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"{","expr":{"expr":{"sequence":{"symbol":"a"}}},"rparen":null}}}}',
  ],
  ["fence-a-rbrace", "a}", '{"expr":{"sequence":{"symbol":"a"},"expr":[{"rparen":"}"}]}}'],
  [
    "fence-double-open",
    "((a)",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"symbol":"a"}}},"rparen":")"}}}},"rparen":null}}}}',
  ],
  [
    "fence-double-close",
    "(a))",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"symbol":"a"}}},"rparen":")"}},"expr":[{"rparen":")"}]}}',
  ],
  [
    "fence-cross-1",
    "[a)",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"[","expr":{"expr":{"sequence":{"symbol":"a"}}},"rparen":")"}}}}',
  ],
  [
    "fence-cross-2",
    "(a]",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"symbol":"a"}}},"rparen":"]"}}}}',
  ],
  ["fence-pipe-one", "|", '{"expr":{"sequence":{"symbol":"|"}}}'],
  [
    "fence-pipe-two",
    "||",
    '{"expr":{"sequence":{"symbol":"|"},"expr":{"sequence":{"symbol":"|"}}}}',
  ],
  ["fence-pipe-a", "|a", '{"expr":{"sequence":{"symbol":"|"},"expr":{"sequence":{"symbol":"a"}}}}'],
  ["fence-a-pipe", "a|", '{"expr":{"sequence":{"symbol":"a"},"expr":{"sequence":{"symbol":"|"}}}}'],
  [
    "fence-trailing-rparen",
    "a b )",
    '{"expr":{"sequence":{"symbol":"a"},"expr":{"sequence":{"symbol":"b"},"expr":[{"rparen":")"}]}}}',
  ],
  ["fence-rparen-x", ")x", '{"expr":[{"rparen":")","expr":{"sequence":{"symbol":"x"}}}]}'],
  ["fence-2-rparen", "2)", '{"expr":{"sequence":{"number":"2"},"expr":[{"rparen":")"}]}}'],
  [
    "fence-nested-open",
    "((((",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":"","rparen":null}}}},"rparen":null}}}},"rparen":null}}}},"rparen":null}}}}',
  ],
  [
    "fence-nested-close",
    "))))",
    '{"expr":[{"rparen":")"},{"rparen":")"},{"rparen":")"},{"rparen":")"}]}',
  ],
  [
    "prep-brace-open",
    "ℒ",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"ℒ","expr":"","rparen":null}}}}',
  ],
  ["prep-brace-close", "ℛ", '{"expr":[{"rparen":"ℛ"}]}'],
  [
    "prep-paren-open",
    "ᑕ",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"ᑕ","expr":"","rparen":null}}}}',
  ],
  ["prep-paren-close", "ᑐ", '{"expr":[{"rparen":"ᑐ"}]}'],
  ["prep-pipe-open", "|", '{"expr":{"sequence":{"symbol":"|"}}}'],
  ["prep-pipe-close", "|", '{"expr":{"sequence":{"symbol":"|"}}}'],
  [
    "prep-brace-open-x",
    "ℒ x",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"ℒ","expr":{"expr":{"sequence":{"symbol":"x"}}},"rparen":null}}}}',
  ],
  ["prep-x-brace-close", "x ℛ", '{"expr":{"sequence":{"symbol":"x"},"expr":[{"rparen":"ℛ"}]}}'],
  [
    "prep-brace-pair",
    "ℒxℛ",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"ℒ","expr":{"expr":{"sequence":{"symbol":"x"}}},"rparen":"ℛ"}}}}',
  ],
  [
    "prep-paren-pair",
    "ᑕxᑐ",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"ᑕ","expr":{"expr":{"sequence":{"symbol":"x"}}},"rparen":"ᑐ"}}}}',
  ],
  [
    "prep-pipe-pair",
    "|x|",
    '{"expr":{"sequence":{"symbol":"|"},"expr":{"sequence":{"symbol":"x"},"expr":{"sequence":{"symbol":"|"}}}}}',
  ],
  ["power-bare", "^", '{"expr":{"sequence":{"symbol":"^"}}}'],
  [
    "power-trailing",
    "x^",
    '{"expr":{"sequence":{"symbol":"x"},"expr":{"sequence":{"symbol":"^"}}}}',
  ],
  [
    "power-double",
    "x^^",
    '{"expr":{"sequence":{"symbol":"x"},"expr":{"sequence":{"symbol":"^^"}}}}',
  ],
  [
    "power-triple",
    "x^^^",
    '{"expr":{"sequence":{"symbol":"x"},"expr":{"sequence":{"symbol":"^^^"}}}}',
  ],
  [
    "power-leading",
    "^x",
    '{"expr":{"sequence":{"symbol":"^"},"expr":{"sequence":{"symbol":"x"}}}}',
  ],
  [
    "power-repeat",
    "x^2^",
    '{"expr":{"power_base":{"power_base":{"symbol":"x"},"power":{"power_value":{"number":"2"}}},"expr":{"sequence":{"symbol":"^"}}}}',
  ],
  ["power-empty-both", "^^", '{"expr":{"sequence":{"symbol":"^^"}}}'],
  ["sub-bare", "_", '{"expr":{"sequence":{"symbol":"_"}}}'],
  ["sub-trailing", "x_", '{"expr":{"sequence":{"symbol":"x"},"expr":{"sequence":{"symbol":"_"}}}}'],
  [
    "sub-double",
    "x__",
    '{"expr":{"power_base":{"power_base":{"symbol":"x"},"base":{"base_value":{"symbol":"_"}}}}}',
  ],
  ["sub-leading", "_x", '{"expr":{"sequence":{"symbol":"_"},"expr":{"sequence":{"symbol":"x"}}}}'],
  [
    "sub-repeat",
    "x_1_",
    '{"expr":{"power_base":{"power_base":{"symbol":"x"},"base":{"base_value":{"number":"1"}}},"expr":{"sequence":{"symbol":"_"}}}}',
  ],
  [
    "sub-power",
    "x_^",
    '{"expr":{"power_base":{"power_base":{"symbol":"x"},"base":{"base_value":{"symbol":"^"}}}}}',
  ],
  [
    "power-sub",
    "x^_",
    '{"expr":{"power_base":{"power_base":{"symbol":"x"},"power":{"power_value":{"symbol":"_"}}}}}',
  ],
  [
    "subsup-trailing",
    "x_1^",
    '{"expr":{"power_base":{"power_base":{"symbol":"x"},"base":{"base_value":{"number":"1"}}},"expr":{"sequence":{"symbol":"^"}}}}',
  ],
  [
    "subsup-both-empty",
    "x_^2",
    '{"expr":{"power_base":{"power_base":{"symbol":"x"},"base":{"base_value":{"symbol":"^"}}},"expr":{"sequence":{"number":"2"}}}}',
  ],
  ["frac-double-slash", "//", '{"expr":{"sequence":{"symbol":"//"}}}'],
  ["frac-a-double", "a//", '{"expr":{"sequence":{"symbol":"a"},"symbol":"//"}}'],
  [
    "frac-double-b",
    "//b",
    '{"expr":{"sequence":{"symbol":"//"},"expr":{"sequence":{"symbol":"b"}}}}',
  ],
  ["frac-fn-name", "frac", '{"expr":{"power_base":{"binary_class":"frac"}}}'],
  [
    "frac-fn-open",
    "frac(",
    '{"expr":{"power_base":{"binary_class":"frac","base_value":{"intermediate_exp":{"lparen":"(","expr":"","rparen":null}}}}}',
  ],
  [
    "frac-fn-a",
    "frac(a",
    '{"expr":{"power_base":{"binary_class":"frac","base_value":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"symbol":"a"}}},"rparen":null}}}}}',
  ],
  [
    "frac-fn-ab",
    "frac(a)(",
    '{"expr":{"power_base":{"binary_class":"frac","base_value":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"symbol":"a"}}},"rparen":")"}},"power_value":{"intermediate_exp":{"lparen":"(","expr":"","rparen":null}}}}}',
  ],
  ["root-name", "root", '{"expr":{"power_base":{"binary_class":"root"}}}'],
  [
    "root-open",
    "root(",
    '{"expr":{"power_base":{"binary_class":"root","base_value":{"intermediate_exp":{"lparen":"(","expr":"","rparen":null}}}}}',
  ],
  [
    "root-empty",
    "root()",
    '{"expr":{"power_base":{"binary_class":"root","base_value":{"intermediate_exp":{"lparen":"(","expr":"","rparen":")"}}}}}',
  ],
  [
    "root-one-arg",
    "root(3)",
    '{"expr":{"power_base":{"binary_class":"root","base_value":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"number":"3"}}},"rparen":")"}}}}}',
  ],
  [
    "root-second-open",
    "root(3)(",
    '{"expr":{"power_base":{"binary_class":"root","base_value":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"number":"3"}}},"rparen":")"}},"power_value":{"intermediate_exp":{"lparen":"(","expr":"","rparen":null}}}}}',
  ],
  ["sqrt-name", "sqrt", '{"expr":{"sequence":{"unary":{"unary_class":"sqrt"}}}}'],
  [
    "sqrt-open",
    "sqrt(",
    '{"expr":{"sequence":{"unary":{"unary_class":"sqrt","intermediate_exp":{"lparen":"(","expr":"","rparen":null}}}}}',
  ],
  [
    "sqrt-empty",
    "sqrt()",
    '{"expr":{"sequence":{"unary":{"unary_class":"sqrt","intermediate_exp":{"lparen":"(","expr":"","rparen":")"}}}}}',
  ],
  ["quote-open", '"', '{"expr":{"sequence":{"text":""}}}'],
  ["quote-open-a", '"a', '{"expr":{"sequence":{"text":""},"expr":{"sequence":{"symbol":"a"}}}}'],
  ["quote-closed", '"a"', '{"expr":{"sequence":{"text":"a"}}}'],
  ["quote-triple", '"""', '{"expr":{"sequence":{"text":[]},"expr":{"sequence":{"text":""}}}}'],
  ["quote-empty", '""', '{"expr":{"sequence":{"text":[]}}}'],
  ["text-name", "text", '{"expr":{"sequence":{"unary":{"unary_class":"text"}}}}'],
  ["text-open", "text(", '{"expr":{"sequence":{"intermediate_exp":{"text":[]}}}}'],
  ["text-open-a", "text(a", '{"expr":{"sequence":{"intermediate_exp":{"text":"a"}}}}'],
  ["text-empty", "text()", '{"expr":{"sequence":{"intermediate_exp":{"text":[]}}}}'],
  [
    "op-plus-trailing",
    "a+",
    '{"expr":{"sequence":{"symbol":"a"},"expr":{"sequence":{"symbol":"+"}}}}',
  ],
  [
    "op-plus-leading",
    "+a",
    '{"expr":{"sequence":{"symbol":"+"},"expr":{"sequence":{"symbol":"a"}}}}',
  ],
  ["op-plus-lone", "+", '{"expr":{"sequence":{"symbol":"+"}}}'],
  ["op-minus-lone", "-", '{"expr":{"sequence":{"symbol":"-"}}}'],
  [
    "op-minus-trailing",
    "a-",
    '{"expr":{"sequence":{"symbol":"a"},"expr":{"sequence":{"symbol":"-"}}}}',
  ],
  ["op-star-lone", "*", '{"expr":{"sequence":{"symbol":"*"}}}'],
  [
    "op-star-trailing",
    "a*",
    '{"expr":{"sequence":{"symbol":"a"},"expr":{"sequence":{"symbol":"*"}}}}',
  ],
  ["op-equals-lone", "=", '{"expr":{"sequence":{"symbol":"="}}}'],
  [
    "op-equals-trailing",
    "a=",
    '{"expr":{"sequence":{"symbol":"a"},"expr":{"sequence":{"symbol":"="}}}}',
  ],
  ["op-lt-lone", "<", '{"expr":{"sequence":{"symbol":"<"}}}'],
  ["op-gt-lone", ">", '{"expr":{"sequence":{"symbol":">"}}}'],
  ["op-bang-lone", "!", '{"expr":{"sequence":{"symbol":"!"}}}'],
  ["op-amp-lone", "&", '{"expr":{"sequence":{"symbol":"&"}}}'],
  ["op-percent-lone", "%", '{"expr":{"sequence":{"symbol":"%"}}}'],
  ["op-at-lone", "@", '{"expr":{"sequence":{"symbol":"@"}}}'],
  ["op-semicolon-lone", ";", '{"expr":{"sequence":{"symbol":";"}}}'],
  ["op-colon-lone", ":", '{"expr":{"sequence":{"symbol":":"}}}'],
  ["op-apostrophe-lone", "'", '{"expr":{"sequence":{"symbol":"\'"}}}'],
  ["op-tilde-lone", "~", '{"expr":{"sequence":{"symbol":"~"}}}'],
  ["op-dollar-lone", "$", '{"expr":{"sequence":{"symbol":"$"}}}'],
  ["op-question-lone", "?", '{"expr":{"sequence":{"symbol":"?"}}}'],
  ["op-comma-lone", ",", '{"expr":{"comma":","}}'],
  ["op-dot-lone", ".", '{"expr":{"sequence":{"symbol":"."}}}'],
  ["op-backslash-lone", "\\", '{"expr":{"sequence":{"symbol":"\\\\"}}}'],
  [
    "op-xx-trailing",
    "a xx",
    '{"expr":{"sequence":{"symbol":"a"},"expr":{"sequence":{"symbol":"xx"}}}}',
  ],
  ["op-xx-lone", "xx", '{"expr":{"sequence":{"symbol":"xx"}}}'],
  [
    "op-mod-trailing",
    "a mod",
    '{"expr":{"sequence":{"symbol":"a"},"expr":{"sequence":{"symbol":"m"},"expr":{"sequence":{"symbol":"o"},"expr":{"sequence":{"symbol":"d"}}}}}}',
  ],
  [
    "op-mod-lone",
    "mod",
    '{"expr":{"sequence":{"symbol":"m"},"expr":{"sequence":{"symbol":"o"},"expr":{"sequence":{"symbol":"d"}}}}}',
  ],
  [
    "op-mod-leading",
    "mod b",
    '{"expr":{"sequence":{"symbol":"m"},"expr":{"sequence":{"symbol":"o"},"expr":{"sequence":{"symbol":"d"},"expr":{"sequence":{"symbol":"b"}}}}}}',
  ],
  ["unknown-section", "§", '{"expr":{"sequence":{"symbol":"§"}}}'],
  ["unknown-eacute", "é", '{"expr":{"sequence":{"symbol":"é"}}}'],
  ["unknown-euro", "€", '{"expr":{"sequence":{"symbol":"€"}}}'],
  ["unknown-snowman", "☃", '{"expr":{"sequence":{"symbol":"☃"}}}'],
  ["unknown-cjk", "字", '{"expr":{"sequence":{"symbol":"字"}}}'],
  ["unknown-astral", "𝑥", '{"expr":{"sequence":{"symbol":"𝑥"}}}'],
  ["unknown-nbsp", NO_BREAK_SPACE, `{"expr":{"sequence":{"symbol":"${NO_BREAK_SPACE}"}}}`],
  [
    "kw-left-lone",
    "left",
    '{"expr":{"sequence":{"symbol":"le"},"expr":{"sequence":{"symbol":"f"},"expr":{"sequence":{"symbol":"t"}}}}}',
  ],
  [
    "kw-left-open",
    "left(",
    '{"expr":{"sequence":{"symbol":"le"},"expr":{"sequence":{"symbol":"f"},"expr":{"sequence":{"symbol":"t"},"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":"","rparen":null}}}}}}}',
  ],
  [
    "kw-left-x",
    "left(x",
    '{"expr":{"sequence":{"symbol":"le"},"expr":{"sequence":{"symbol":"f"},"expr":{"sequence":{"symbol":"t"},"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"symbol":"x"}}},"rparen":null}}}}}}}',
  ],
  [
    "kw-color-lone",
    "color",
    '{"expr":{"sequence":{"symbol":"c"},"expr":{"sequence":{"symbol":"o"},"expr":{"sequence":{"symbol":"l"},"expr":{"sequence":{"symbol":"o"},"expr":{"sequence":{"symbol":"r"}}}}}}}',
  ],
  [
    "kw-color-open",
    "color(",
    '{"expr":{"sequence":{"symbol":"c"},"expr":{"sequence":{"symbol":"o"},"expr":{"sequence":{"symbol":"l"},"expr":{"sequence":{"symbol":"o"},"expr":{"sequence":{"symbol":"r"},"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":"","rparen":null}}}}}}}}}',
  ],
  [
    "kw-color-red",
    "color(red)",
    '{"expr":{"sequence":{"symbol":"c"},"expr":{"sequence":{"symbol":"o"},"expr":{"sequence":{"symbol":"l"},"expr":{"sequence":{"symbol":"o"},"expr":{"sequence":{"symbol":"r"},"expr":{"sequence":{"intermediate_exp":{"lparen":"(","expr":{"expr":{"sequence":{"symbol":"r"},"expr":{"sequence":{"symbol":"e"},"expr":{"sequence":{"symbol":"d"}}}}},"rparen":")"}}}}}}}}}',
  ],
  ["kw-norm-lone", "norm", '{"expr":{"sequence":{"unary":{"unary_class":"norm"}}}}'],
  [
    "kw-norm-open",
    "norm[[",
    '{"expr":{"sequence":{"unary":{"unary_class":"norm","intermediate_exp":{"lparen":"[","expr":{"expr":{"sequence":{"intermediate_exp":{"lparen":"[","expr":"","rparen":null}}}},"rparen":null}}}}}',
  ],
  [
    "kw-table-partial",
    "[[a]",
    '{"expr":{"sequence":{"intermediate_exp":{"lparen":"[","expr":{"expr":{"sequence":{"intermediate_exp":{"lparen":"[","expr":{"expr":{"sequence":{"symbol":"a"}}},"rparen":"]"}}}},"rparen":null}}}}',
  ],
  [
    "kw-table-ok",
    "[[a]]",
    '{"left_right":{"table":{"table_left":{"table_left":"["},"table_row":{"open_tr":"[","tds_list":{"td":{"expr":{"sequence":{"symbol":"a"}}}}},"table_right":{"table_right":"]"}}}}',
  ],
  [
    "prep-after-brace-pair-slash-b",
    "ℒaℛ/b",
    '{"expr":{"frac":{"numerator":{"intermediate_exp":{"lparen":"ℒ","expr":{"expr":{"sequence":{"symbol":"a"}}},"rparen":"ℛ"}},"denominator":{"sequence":{"symbol":"b"}}}}}',
  ],
  [
    "prep-brace-frac-leading",
    "ℒ/b",
    '{"expr":{"frac":{"numerator":{"intermediate_exp":{"lparen":"ℒ","expr":"","rparen":null}},"denominator":{"sequence":{"symbol":"b"}}}}}',
  ],
];

/**
 * The eighteen the two pegkit divergences used to claim, kept as a named list
 * because they are the sharpest regression guard in this file.
 *
 * The first fourteen are unmatched CLOSING parens, which reach `expression`'s
 * sixth alternative only through Parslet's `consume_all` retry; the last four
 * are empty named repetitions, `[]` to Parslet's `flatten_repetition`. Both are
 * now implemented in pegkit, so all eighteen go through the ordinary
 * gem-tree assertions above — this list only asserts that they are *in* those
 * assertions rather than quietly skipped.
 */
const FORMER_DIVERGENCES: readonly string[] = [
  "fence-rparen",
  "fence-a-rparen",
  "fence-rbracket",
  "fence-a-rbracket",
  "fence-rbrace",
  "fence-a-rbrace",
  "fence-double-close",
  "fence-trailing-rparen",
  "fence-rparen-x",
  "fence-2-rparen",
  "fence-nested-close",
  // `:}` and `:)` preprocess to `ℛ` and `ᑐ`, which are closing parens, so a
  // bare preprocessing token lands in the same family.
  "prep-brace-close",
  "prep-paren-close",
  "prep-x-brace-close",
  "quote-triple",
  "quote-empty",
  "text-open",
  "text-empty",
];

const INPUT_BY_ID = new Map(CANDIDATES.map(([id, input]) => [id, input]));

function inputFor(id: string): string {
  const input = INPUT_BY_ID.get(id);
  if (input === undefined) throw new Error(`no candidate named ${id}`);
  return input;
}

describe("the candidate list", () => {
  // A rejection suite that runs zero cases passes silently, and this repository
  // has already shipped one gate that did exactly that (`depcruise` cruising
  // zero modules). Every count below is asserted as a count.
  it("has the number of candidates the sweep probed", () => {
    expect(CANDIDATES.length).toBe(156);
    expect(REJECTIONS.length).toBe(26);
    expect(ACCEPTANCES.length).toBe(130);
    expect(REJECTIONS.length + ACCEPTANCES.length).toBe(CANDIDATES.length);
    expect(REJECTIONS.length).toBeGreaterThan(0);
    expect(ACCEPTANCES.length).toBeGreaterThan(0);
  });

  it("names every candidate exactly once", () => {
    expect(new Set(CANDIDATES.map(([id]) => id)).size).toBe(CANDIDATES.length);
  });

  it("splits into the two tables by the gem's verdict, with nothing left over", () => {
    const rejectedIds = new Set(REJECTIONS.map(([id]) => id));
    const acceptedIds = new Set(ACCEPTANCES.map(([id]) => id));
    for (const [id, , verdict] of CANDIDATES) {
      expect(rejectedIds.has(id), `${id} in REJECTIONS`).toBe(verdict === "rejects");
      expect(acceptedIds.has(id), `${id} in ACCEPTANCES`).toBe(verdict === "accepts");
    }
    expect(rejectedIds.size).toBe(REJECTIONS.length);
    expect(acceptedIds.size).toBe(ACCEPTANCES.length);
  });

  it("covers every input class the plan names", () => {
    // TODO.plan/p1-asciimath/08-p1-completion.md: a class with no rejection case
    // is fine, a class nobody checked is not. Each prefix is one class.
    const prefixes = [
      "empty",
      "space-",
      "fence-",
      "prep-",
      "power-",
      "sub",
      "frac-",
      "root-",
      "sqrt-",
      "quote-",
      "text-",
      "op-",
      "unknown-",
      "kw-",
    ];
    for (const prefix of prefixes) {
      expect(
        CANDIDATES.some(([id]) => id.startsWith(prefix)),
        prefix,
      ).toBe(true);
    }
    // Both halves of the one class the plan calls out by name.
    expect(REJECTIONS.some(([id]) => id === "frac-trailing")).toBe(true);
    expect(REJECTIONS.some(([id]) => id === "frac-leading")).toBe(true);
    // Malformed entities: not applicable. AsciiMath decodes no entities, so
    // there is no such input to write. Asserted as an absence on purpose.
    expect(CANDIDATES.some(([id]) => id.startsWith("entity-"))).toBe(false);
  });

  it("preprocesses each candidate exactly as the gem does", () => {
    // The recorded `preprocessed` column came from `Asciimath::Parser#text`, so
    // this is a second, per-candidate check of preprocess.spec.ts's parity.
    for (const [id, preprocessed] of [...REJECTIONS, ...ACCEPTANCES]) {
      expect(preprocess(inputFor(id)).text, id).toBe(preprocessed);
    }
  });
});

describe("what the gem rejects, this port rejects", () => {
  it.each(REJECTIONS.map(([id]) => [id] as const))("%s", (id) => {
    const error = rejectionOf(inputFor(id));
    expect(error, `${id} must be rejected`).not.toBeNull();
    expect((error as ParseError).code).toBe("PARSE_ERROR");
    expect((error as ParseError).format).toBe("asciimath");
    expect((error as ParseError).input).toBe(inputFor(id));
  });

  it("rejects all 26 and no more", () => {
    const rejected = CANDIDATES.filter(([, input]) => rejectionOf(input) !== null);
    // Exactly the 26 the gem refuses. Any other number is a divergence, in
    // either direction. This used to allow 14 more — the unmatched closing
    // parens pegkit could not reach before it grew `consume_all`.
    expect(rejected.length).toBe(REJECTIONS.length);
  });
});

describe("what the gem accepts, this port accepts and shapes the same", () => {
  it("has every acceptance the sweep found", () => {
    expect(ACCEPTANCES.length).toBe(130);
  });

  it.each(ACCEPTANCES.map(([id, , gemTree]) => [id, gemTree] as const))(
    "%s parses to the tree Parslet produced",
    (id, gemTree) => {
      expect(parseInput(inputFor(id))).toStrictEqual(JSON.parse(gemTree));
    },
  );
});

describe("failure positions index the original input", () => {
  it.each(REJECTIONS)(
    "%s reports %s at index %i, mapped to %i (%j)",
    (id, preprocessed, preprocessedIndex, index, remainder) => {
      const input = inputFor(id);

      // The raw parser offset, into the preprocessed text.
      let raw: number | null = null;
      try {
        grammar.root.parse(preprocessed);
      } catch (error) {
        if (!(error instanceof ParseFailed)) throw error;
        raw = error.index;
      }
      expect(raw, `${id} preprocessed offset`).toBe(preprocessedIndex);

      // The same failure after the SourceMap, which is what a caller sees.
      const error = rejectionOf(input) as ParseError;
      expect(error.index, `${id} original offset`).toBe(index);

      // The same claim without counting: what is left of the caller's input.
      expect(input.slice(index), `${id} remainder`).toBe(remainder);
    },
  );

  it("never points outside the caller's input", () => {
    for (const [id] of REJECTIONS) {
      const input = inputFor(id);
      const error = rejectionOf(input) as ParseError;
      expect(error.index, id).toBeGreaterThanOrEqual(0);
      expect(error.index, id).toBeLessThanOrEqual(input.length);
    }
  });

  it("does not split a surrogate pair", () => {
    // `{:𝑥:}a/` — two digraphs and an astral character before the failure. An
    // index landing between the two code units of `𝑥` would slice a lone
    // surrogate out of the caller's string.
    const input = inputFor("prep-astral-frac");
    const error = rejectionOf(input) as ParseError;
    expect(error.index).toBe(7);
    expect(input.slice(error.index)).toBe("/");
    expect(input.codePointAt(2)).toBe(0x1d465);
    // Slicing at the reported index leaves the pair intact on both sides.
    expect(Array.from(input.slice(0, error.index)).length).toBe(6);
  });

  it("is not the raw parser offset — the SourceMap is load-bearing", () => {
    // The guard against an implementation that forgets to map. Eleven of the
    // 26 rejections have a length-changing rewrite before the failure, so
    // returning `ParseFailed.index` unchanged would be wrong for all eleven.
    const shifted = REJECTIONS.filter(([, , preIndex, index]) => preIndex !== index);
    expect(shifted.length).toBe(11);
    for (const [id, , preIndex, index] of shifted) {
      const input = inputFor(id);
      expect(index, id).toBeGreaterThan(preIndex);
      // And the unmapped offset really would point somewhere else.
      expect(input.slice(preIndex), id).not.toBe(input.slice(index));
    }
  });

  it("points at the first character of a rewritten digraph, not its second", () => {
    // `x:}y/` preprocesses to `xℛy/` and stops at the `ℛ`. The digraph occupies
    // original offsets 1 and 2; the reported index must be 1, so that
    // `input.slice(index)` starts with the whole token.
    for (const [id, digraph] of [
      ["prep-brace-close-frac", ":}"],
      ["prep-paren-close-frac", ":)"],
    ] as const) {
      const input = inputFor(id);
      const error = rejectionOf(input) as ParseError;
      expect(error.index, id).toBe(1);
      // Reporting 2 — the digraph's second character — would slice the token in
      // half, which is the `SourceMap` bug that clamped past-end offsets into
      // the middle of a token (`.codex-context/STATUS.md`).
      expect(input.slice(error.index, error.index + 2), id).toBe(digraph);
    }
  });
});

describe("the position the gem exposes", () => {
  // Measured, not assumed — the three facts the header records, restated as
  // assertions about this port so a future change has to confront them.
  //
  //   Math::ParseError            no position at all (cause: nil)
  //   Parslet cause.pos.charpos   0 for all 26, message identical for all 26
  //   deepest cause in the tree   an internal walk, and disagrees on 3 of 26
  //
  // So the index is this port's own contract, and these are its terms.

  it("reports a distinct position per input, which the gem's own error does not", () => {
    const positions = new Set(REJECTIONS.map(([, , , index]) => index));
    // Parslet reports char 1 for every one of these; this port reports ten
    // different offsets — 0, 1, 2, 3, 4, 5, 6, 7, 11 and 17. That difference is
    // the whole value of the contract.
    expect(positions.size).toBeGreaterThan(1);
    expect(positions.size).toBe(10);
    expect([...positions].sort((left, right) => left - right)).toStrictEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 11, 17,
    ]);
  });

  it("carries the caller's input, as the gem's error does", () => {
    // `Math::ParseError.new(text, type)` keeps the text and the format. Those
    // two fields are the part of the gem's error there is anything to mirror.
    const error = rejectionOf("a/") as ParseError;
    expect(error.input).toBe("a/");
    expect(error.format).toBe("asciimath");
    expect(error.code).toBe("PARSE_ERROR");
  });

  it("never hard-fails: every rejection is unconsumed input, not a dead end", () => {
    // `expression`'s fifth alternative is `str("")`, which always succeeds, so
    // the root always matches a prefix and `Atom#parse` reports `result.pos`.
    // The observable consequence: the reported index is always the start of a
    // suffix the parser did not consume, so it is strictly less than the
    // preprocessed length whenever the input is non-empty.
    for (const [id, preprocessed, preprocessedIndex] of REJECTIONS) {
      expect(preprocessedIndex, id).toBeLessThan(preprocessed.length);
    }
  });

  /**
   * The three cases where this port's offset differs from the deepest position
   * anywhere in Parslet's cause tree. Recorded because they were measured and
   * are not a bug — the two are different quantities, and they coincide on the
   * other 23 only because the deepest failing atom usually sits exactly where
   * the consumed prefix ends.
   *
   * Deepest-cause figures from walking `Cause#children` on the oracle, as
   * character offsets into the preprocessed text:
   *
   *   left(x right   this port 7 (`right` begins)   Parslet's deepest 12 (end)
   *   x:}y/  ->  xℛy/   this port 1 (`ℛ`)           Parslet's deepest 3 (`/`)
   *   x:)y/  ->  xᑐy/   this port 1 (`ᑐ`)           Parslet's deepest 3 (`/`)
   *
   * In each, the parse legitimately consumed only a prefix; the deeper offset
   * was reached by an alternative that was then discarded. `left(x right` is
   * the clearest: the `left ... right` branch does reach the end of the input
   * looking for a closing paren, but the branch that *wins* stops at `right`.
   * Reporting 12 there would name a character the accepted parse never used.
   */
  it.each([
    ["kw-left-x-right", 7, "right"],
    ["prep-brace-close-frac", 1, ":}y/"],
    ["prep-paren-close-frac", 1, ":)y/"],
  ] as const)(
    "%s stops where the prefix ends (%i), not at Parslet's deepest cause",
    (id, index, remainder) => {
      const input = inputFor(id);
      const error = rejectionOf(input) as ParseError;
      expect(error.index).toBe(index);
      expect(input.slice(index)).toBe(remainder);
    },
  );
});

/**
 * There is no divergence left in this sweep. What used to be recorded here as
 * two families of accepted-difference is now closed in pegkit, so the guard
 * flips: these eighteen must be *accepted* and must carry the gem's tree.
 */
describe("the two former pegkit divergences", () => {
  it("still counts eighteen, all of them accepted by the gem", () => {
    expect(FORMER_DIVERGENCES.length).toBe(18);
    const acceptedIds = new Set(ACCEPTANCES.map(([id]) => id));
    for (const id of FORMER_DIVERGENCES) {
      expect(acceptedIds.has(id), id).toBe(true);
    }
  });

  it.each(FORMER_DIVERGENCES.map((id) => [id] as const))(
    "%s is accepted, with the tree Parslet produced",
    (id) => {
      const gemTree = ACCEPTANCES.find(([candidate]) => candidate === id)?.[2] as string;
      expect(rejectionOf(inputFor(id)), id).toBeNull();
      expect(parseInput(inputFor(id))).toStrictEqual(JSON.parse(gemTree));
    },
  );

  it("keeps an empty NAMED repetition an empty array, not an empty string", () => {
    // `flatten_repetition`'s `return [] if named && list.empty?`. The four
    // inputs that reach it, and the shape that used to be wrong here.
    expect(parseInput('""')).toStrictEqual(JSON.parse('{"expr":{"sequence":{"text":[]}}}'));
    expect(parseInput("text(")).toStrictEqual(
      JSON.parse('{"expr":{"sequence":{"intermediate_exp":{"text":[]}}}}'),
    );
  });

  it("reaches expression's alternative 6 for an unmatched closing paren", () => {
    // The alternative that was dead code before `consume_all`.
    expect(parseInput(")")).toStrictEqual(JSON.parse('{"expr":[{"rparen":")"}]}'));
  });
});
