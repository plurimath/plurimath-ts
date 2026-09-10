/**
 * HTML input preprocessing — `Html::Parser#normalized_text`
 * (`lib/plurimath/html/parser.rb:27-33`), ported together with the offset
 * bookkeeping the gem does not need.
 *
 * The gem:
 *
 * ```ruby
 * HTML_ENTITY = /&(?:#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/i
 *
 * def normalized_text
 *   text.gsub(HTML_ENTITY) do |entity|
 *     decoded_entity = Utility.html_entity_to_unicode(entity)
 *     Utility.string_to_html_entity(decoded_entity)
 *   end
 * end
 * ```
 *
 * ## Why this is not LaTeX's pass with a different name
 *
 * `Latex::Parser#pre_processing` (`latex/parser.rb:27`) encodes the WHOLE
 * text: `@enti.encode(@enti.decode(text), :hexadecimal)`. HTML cannot — the
 * encoder's first pass rewrites `<` to `&#x3c;`, and there would be no tag
 * left to parse. So the round trip here is scoped to substrings that already
 * match `HTML_ENTITY`, and everything else survives byte for byte.
 *
 * Measured, on the pinned oracle: `Html::Parser` leaves `"<td>x</td>"` alone
 * where `Latex::Parser` gives `"&#x3c;td&#x3e;x&#x3c;/td&#x3e;"`, and the
 * Arabic decimal marker `"٫"` normalises to itself here where LaTeX's pass
 * turns it into `&#x66b;`. That second fact is why the grammar's
 * `decimalMarkerAtom` matches the RAW marker.
 *
 * ## Three results a reader would otherwise predict wrongly
 *
 * All three are oracle measurements, not readings of the Ruby:
 *
 * 1. `"&nosuchentity;"` becomes `"&#x26;nosuchentity;"`. The regexp matches
 *    it, `HTMLEntities#decode` does not know the name and returns it as
 *    written, and the encoder then hits the leading `&`. The entity is not
 *    left alone — it is mangled.
 * 2. `"&AMP;"` becomes `"&#x26;AMP;"`, for the same reason: `HTML_ENTITY`
 *    carries `/i` and matches, while the gem's decode table is
 *    case-sensitive.
 * 3. `"&a;"` is left ALONE. `[a-z][a-z0-9]+` needs two or more characters, so
 *    a one-letter name never matches the regexp in the first place.
 *
 * ## Offsets
 *
 * A replaced entity almost never keeps its length, so an offset into the
 * normalised text does not index the caller's input. Every position that
 * reaches a user — `ParseError.index` above all — goes through the returned
 * `SourceMap` first (ARCHITECTURE.md §5). Offsets are UTF-16 code units end to
 * end, matching pegkit's contract.
 */

import { htmlEntityToUnicode } from "../../core/nodes";
import { type PreprocessSegment, SourceMap } from "../../pegkit/index";

/**
 * `Html::Parser::HTML_ENTITY` (`html/parser.rb:8`), verbatim:
 * `/&(?:#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/i`.
 *
 * Ruby's `\d` and JavaScript's are both ASCII-only, and `[0-9a-f]` under `/i`
 * covers `A-F` in both, so the class transcribes directly. A factory, not a
 * constant: a global regex carries `lastIndex`, and this module scans twice.
 */
function entityPattern(): RegExp {
  return /&(?:#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi;
}

/**
 * `TransformUtility::HTML_ENTITY` (`html/transform_utility.rb:8`) — the SAME
 * alternation under `\A`/`\z` rather than unanchored.
 *
 * `\z` is not JavaScript's `$`: `$` also matches before a trailing newline, and
 * `Utility.string_to_html_entity` encodes a newline to `&#xa;`, so the two
 * would disagree on `"&amp;\n"`. Matching unanchored and then checking the
 * match covers the whole string is `\A...\z` exactly.
 */
const ANCHORED_ENTITY = /^&(?:#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/i;

/** `text.match?(HTML_ENTITY)` under `\A`/`\z` — see `ANCHORED_ENTITY`. */
export function isWholeHtmlEntity(text: string): boolean {
  const match = ANCHORED_ENTITY.exec(text);
  return match !== null && match[0].length === text.length;
}

/**
 * `HTMLEntities::Encoder`'s two passes for the `xhtml1` flavour with the
 * `:hexadecimal` instruction (`htmlentities-4.4.2/lib/htmlentities/encoder.rb`),
 * which is what `Utility.string_to_html_entity` (`utility.rb:220-226`) runs:
 *
 *   - `replace_basic` over `/[<>'"&]/` — note the apostrophe, which the
 *     `html4` flavour would not encode and the gem's default flavour does;
 *   - `replace_extended` over `/[^\u{20}-\u{7E}]/`.
 *
 * Both replace with `"&#x#{codepoint.to_s(16)};"` — lowercase, unpadded. The
 * order matters: `replace_basic` turns `&` into `&#x26;`, every character of
 * which is printable ASCII, so `replace_extended` leaves it alone. That is
 * what produces the `&#x26;nosuchentity;` in this module's header.
 *
 * `replace_extended` iterates CODE POINTS, so an astral character becomes one
 * entity rather than two surrogate halves — hence the `u` flag.
 *
 * This is a second copy of `latex/preprocess.ts`'s encoder rather than a
 * shared one: ARCHITECTURE.md §3 rule 3 lets a format import layer 1, leaf
 * services and its own files, and another format's preprocessor is none of
 * those. `HTML_SYMBOL_NORMALIZATION_PROBES` in
 * `./generated/transform-tables` samples `TransformUtility.normalize_symbol`,
 * which reaches the gem's encoder only for a text it does not pass through —
 * so a recorded row is not always this encoder's own output. It is there for a
 * reader to check by eye; no test asserts against it yet.
 */
const ENCODE_BASIC = /[<>'"&]/g;
const ENCODE_EXTENDED = /[^ -~]/gu;

function hexEntity(character: string): string {
  const codepoint = character.codePointAt(0);
  if (codepoint === undefined) {
    // Unreachable: a regex match is never the empty string here.
    throw new Error("html preprocess: empty match while encoding");
  }
  return `&#x${codepoint.toString(16)};`;
}

/** `Utility.string_to_html_entity` (`utility.rb:220-226`). */
export function stringToHtmlEntity(text: string): string {
  return text
    .replace(ENCODE_BASIC, (character) => hexEntity(character))
    .replace(ENCODE_EXTENDED, (character) => hexEntity(character));
}

export interface PreprocessedHtml {
  /** The normalised text the grammar parses. */
  readonly text: string;
  /** Translates an offset in `text` back to an offset in the caller's input. */
  readonly map: SourceMap;
}

/**
 * `Html::Parser#normalized_text`, with a `SourceMap`.
 *
 * One `gsub` and therefore one pass: each match becomes its own segment, and
 * the runs between matches are copied through as identity segments. A trailing
 * identity segment is emitted even when empty, so `SourceMap.fromSegments`
 * learns the original length and a past-the-end failure index clamps to it.
 */
export function preprocess(input: string): PreprocessedHtml {
  const segments: PreprocessSegment[] = [];
  let cursor = 0;
  let output = "";
  for (const match of input.matchAll(entityPattern())) {
    const entity = match[0];
    if (match.index > cursor) {
      const between = input.slice(cursor, match.index);
      segments.push({ originStart: cursor, originLength: between.length, output: between });
      output += between;
    }
    const replacement = stringToHtmlEntity(htmlEntityToUnicode(entity));
    segments.push({ originStart: match.index, originLength: entity.length, output: replacement });
    output += replacement;
    cursor = match.index + entity.length;
  }
  const tail = input.slice(cursor);
  segments.push({ originStart: cursor, originLength: tail.length, output: tail });
  output += tail;
  return { text: output, map: SourceMap.fromSegments(segments) };
}
