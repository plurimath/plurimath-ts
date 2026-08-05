/**
 * AsciiMath input preprocessing — the `gsub` chain in
 * `Asciimath::Parser#initialize` (`lib/plurimath/asciimath/parser.rb:9-15`),
 * ported together with the offset bookkeeping the gem does not need.
 *
 * The gem:
 *
 * ```ruby
 * @text = text
 *   &.gsub(/(\|:|:\|)/, "|")
 *   &.gsub(/(\{:)/, "ℒ")
 *   &.gsub(/(:\})/, "ℛ")
 *   &.gsub(/(\(:)/, "ᑕ")
 *   &.gsub(/(:\))/, "ᑐ")
 * ```
 *
 * Two properties of that chain are load-bearing and are why this is not a
 * single scan over the input:
 *
 * 1. **Each `gsub` is a separate pass over the whole string.** An earlier pass
 *    wins over a later one even when the later one's token starts further
 *    left. Verified against the gem: `"{:|"` preprocesses to `"{|"` — pass 1
 *    rewrites the `:|` at offset 1, leaving a `{` that pass 2 can no longer
 *    pair with anything. A single ordered scan would take `{:` at offset 0 and
 *    produce `"ℒ|"`, which is wrong.
 * 2. **A pass never re-runs over its own output.** `":|:"` becomes `"|:"` —
 *    the result still contains `|:`, and the gem leaves it alone.
 *
 * Preprocessing is also **blind to quoting**: `"\"{:x:}\""` becomes
 * `"\"ℒxℛ\""` in the gem, so a token inside AsciiMath quoted text is rewritten
 * like any other.
 *
 * ## Offsets
 *
 * Four of the five rewrites replace two characters with one, so an offset into
 * the preprocessed text does not index the caller's input. Every position that
 * reaches a user — `ParseError.index` above all — goes through the returned
 * `SourceMap` first (ARCHITECTURE.md §5, §7).
 *
 * Offsets are UTF-16 code units end to end, matching pegkit's contract
 * (`Slice.offset`, `ParseFailed.index`). Character width is never assumed:
 * segments are built per code unit, so an astral character in the input keeps
 * an exact identity mapping for both of its units instead of collapsing them
 * onto the first.
 */

import { type PreprocessSegment, SourceMap } from "../../pegkit/index";

/** One `gsub` from the chain: ordered alternatives, and what they become. */
interface RewritePass {
  /** Literal alternatives, in the regex's order — the first that matches wins. */
  readonly from: readonly string[];
  /** The replacement. Never empty; see `toSegments`. */
  readonly to: string;
}

/**
 * The chain, in the gem's order. The order is behaviour, not cosmetics: moving
 * the pipe pass after the brace pass changes what `"{:|"` parses as.
 */
const PASSES: readonly RewritePass[] = [
  { from: ["|:", ":|"], to: "|" },
  { from: ["{:"], to: "ℒ" }, // U+2112 SCRIPT CAPITAL L
  { from: [":}"], to: "ℛ" }, // U+211B SCRIPT CAPITAL R
  { from: ["(:"], to: "ᑕ" }, // U+1455 CANADIAN SYLLABICS TA
  { from: [":)"], to: "ᑐ" }, // U+1450 CANADIAN SYLLABICS TO
];

export interface PreprocessedInput {
  /** The rewritten text the grammar parses. */
  readonly text: string;
  /** Translates an offset in `text` back to an offset in the caller's input. */
  readonly map: SourceMap;
}

/**
 * The half-open span of ORIGINAL code units each unit of the working text came
 * from. Two flat arrays rather than an array of pairs: this is rebuilt once per
 * pass, and the arrays are discarded as soon as the segments are cut.
 */
interface OriginSpans {
  readonly start: number[];
  /** Exclusive. */
  readonly end: number[];
}

/**
 * Rewrite AsciiMath input as the gem's parser does, and return the map that
 * takes offsets in the result back to the input.
 *
 * On `nil`/`null`: the gem's `&.` keeps a nil input nil instead of raising
 * here, but that only moves the failure — `Parser.new(nil).parse` raises
 * `ArgumentError: Must construct Source with a string like object.` from
 * Parslet, and `Plurimath::Math.parse(nil, :asciimath)` turns that into a
 * `Plurimath::Math::ParseError`. Nil is not a supported input in the gem
 * either, so threading `string | null` through the grammar and the source map
 * would buy nothing. A non-string is rejected here instead, because the
 * alternative is worse than either: `String(null)` would silently preprocess
 * the text `"null"`, and an unchecked `input.startsWith` would surface as an
 * unattributed `TypeError` from inside the scan.
 */
export function preprocess(input: string): PreprocessedInput {
  const received: unknown = input;
  if (typeof received !== "string") {
    const kind = received === null ? "null" : typeof received;
    throw new TypeError(`AsciiMath input must be a string, received ${kind}`);
  }

  let text = input;
  let spans: OriginSpans = {
    start: Array.from({ length: input.length }, (_, index) => index),
    end: Array.from({ length: input.length }, (_, index) => index + 1),
  };

  for (const pass of PASSES) {
    const next = applyPass(text, spans, pass);
    text = next.text;
    spans = next.spans;
  }

  return { text, map: SourceMap.fromSegments(toSegments(text, spans)) };
}

/**
 * One `gsub`: scan left to right, and at each position take the first
 * alternative that matches — Ruby's leftmost-first alternation. The scan
 * resumes after a replacement, so a pass never sees what it just wrote.
 */
function applyPass(
  text: string,
  spans: OriginSpans,
  pass: RewritePass,
): { text: string; spans: OriginSpans } {
  const pieces: string[] = [];
  const start: number[] = [];
  const end: number[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const literal = pass.from.find((candidate) => text.startsWith(candidate, cursor));
    if (literal === undefined) {
      // Copy one code unit. Splitting a surrogate pair is harmless: both halves
      // keep their own identity span, and the pieces are rejoined verbatim.
      pieces.push(text.slice(cursor, cursor + 1));
      start.push(spans.start[cursor] as number);
      end.push(spans.end[cursor] as number);
      cursor += 1;
      continue;
    }
    // The whole matched run collapses to one span, so every unit of the
    // replacement points at the first character of what it replaced.
    const spanStart = spans.start[cursor] as number;
    const spanEnd = spans.end[cursor + literal.length - 1] as number;
    pieces.push(pass.to);
    for (let unit = 0; unit < pass.to.length; unit++) {
      start.push(spanStart);
      end.push(spanEnd);
    }
    cursor += literal.length;
  }

  return { text: pieces.join(""), spans: { start, end } };
}

/**
 * Cut the working text into `PreprocessSegment`s: adjacent units sharing a span
 * came from one rewrite and stay together, everything else becomes its own
 * one-unit segment. `SourceMap.fromSegments` points every unit of a segment at
 * that segment's start, so an untouched character must not be merged with its
 * neighbours — the map would then report all of them at the run's first offset.
 *
 * Because no replacement is empty, every original character survives into at
 * least one segment; the last segment therefore reaches the end of the input,
 * which is what `SourceMap` derives its past-the-end clamp from.
 */
function toSegments(text: string, spans: OriginSpans): PreprocessSegment[] {
  const segments: PreprocessSegment[] = [];
  let unit = 0;

  while (unit < text.length) {
    const spanStart = spans.start[unit] as number;
    const spanEnd = spans.end[unit] as number;
    let after = unit + 1;
    while (
      after < text.length &&
      spans.start[after] === spanStart &&
      spans.end[after] === spanEnd
    ) {
      after += 1;
    }
    segments.push({
      originStart: spanStart,
      originLength: spanEnd - spanStart,
      output: text.slice(unit, after),
    });
    unit = after;
  }

  return segments;
}
