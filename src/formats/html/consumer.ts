/** Shared HTML consumer policy; no grammar or runtime loading. */
import { describeThrown, requireKnownParseOptions } from "../../core/errors";
import { type FormulaNode, type OnUnsupported, ParseError } from "../../core/index";
import { type LocaleOptions, requireLocaleKey } from "../../formatting/index";
import { type ParseValue, Slice, type SourceMap } from "../../pegkit/index";
import { preprocess } from "./preprocess";
import { finalizeHtmlParse, htmlTransform } from "./transform";

/**
 * Locale (the decimal marker the grammar reads at parse time) plus the
 * deferred-construct hook §5 promises on every parser.
 *
 * `onUnsupported` is accepted and never fired: `html/parse.rb` has no
 * commented-out alternative and no construct this port declines, unlike
 * AsciiMath's UnitsML branch. It is in the signature so the shape matches the
 * other parsers rather than to describe a behaviour that exists.
 *
 * `locale` and `onUnsupported` are also the two keys `validateOptions` treats
 * as known — anything else raises `ParseOptionError` before parsing starts.
 */
export interface HtmlParseOptions extends LocaleOptions {
  readonly onUnsupported?: OnUnsupported;
}

/** The keys `validateOptions` accepts — see `HtmlParseOptions` and `ParseOptionError`. */
const KNOWN_OPTION_KEYS: ReadonlySet<string> = new Set<keyof HtmlParseOptions>([
  "locale",
  "onUnsupported",
]);

/**
 * `Math.parse`'s own two option checks (`math.rb:33-38`), run before
 * `parse_formula` — and so before `normalize` — ever touches the text:
 * unknown KEYS first (`raise_unknown_parse_options!`), then the `locale`
 * VALUE (`normalize_parse_options` → `SupportedLocales.key_for!`, ported as
 * `requireLocaleKey`). Both raise their own type, not a `ParseError` — see
 * `ParseOptionError`'s doc and `UnsupportedLocaleError`'s.
 *
 * Order is observable, not incidental. Measured:
 * `Math.parse("&#55296;", :html, locale: "xx")` raises
 * `Plurimath::Errors::UnsupportedLocale`, not the `ParseError` that
 * `&#55296;` alone raises (a lone surrogate — normalisation's own
 * `RangeError: invalid codepoint 0xD800 in UTF-8`) — because the gem
 * validates options before normalisation runs at all. Running this after
 * `normalize` would report the wrong failure for exactly that input.
 */
export function validateOptions(options?: HtmlParseOptions | null): void {
  requireKnownParseOptions(options, KNOWN_OPTION_KEYS);
  requireLocaleKey(options?.locale);
}

/**
 * Ruby's JSON library caps container nesting at 100 by default
 * (`max_nesting`), and `html/parser.rb:18`'s `nodes.to_json` inherits that
 * cap unmodified. Measured against the oracle: `Html::Parser.new("x" *
 * 100).parse` succeeds; `"x" * 101` raises `JSON::NestingError: nesting of
 * 100 is too deep` from `to_json` itself — `Parse.new.parse` succeeds for
 * both, so the grammar never sees a failure here, only the round trip does.
 *
 * The limit is on the PARSLET TREE's depth, not on input length — `"x" * n`
 * only happens to make those the same number, because `Html::Parse#sequence`/
 * `#expression` (`html/parse.rb:104-124`) nest one `expression` key per extra
 * letter. An input-length cutoff would agree with the gem on this one shape
 * and disagree on any other, so `plainTree` counts the depth of the tree it
 * is already walking instead.
 */
const JSON_MAX_NESTING = 100;

/**
 * `JSON.parse(nodes.to_json, symbolize_names: true)` (`html/parser.rb:18`)
 * over a Parslet tree, whose leaves are slices, hashes, arrays and nil.
 *
 * `Parslet::Slice` has no `to_json` of its own, so the JSON library falls back
 * to `to_s` — measured: `Parse.new.parse("x").to_json` is `{"text":"x"}` and
 * the reparsed tree carries the String `"x"`. Hash keys survive as the same
 * symbols, and `nil` survives as `nil`, so nothing else about the tree moves —
 * except that a Hash or Array one level past `JSON_MAX_NESTING` never reaches
 * the transform at all; see `JSON_MAX_NESTING` above.
 */
function plainTree(value: ParseValue, depth = 0): unknown {
  if (value instanceof Slice) return value.text;
  if (Array.isArray(value)) {
    const childDepth = enterContainer(depth);
    return value.map((entry) => plainTree(entry, childDepth));
  }
  if (value !== null && typeof value === "object") {
    const childDepth = enterContainer(depth);
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) result[key] = plainTree(entry, childDepth);
    return result;
  }
  return value;
}

/** `depth + 1`, or throws Ruby's own message once that would exceed `JSON_MAX_NESTING`. */
function enterContainer(depth: number): number {
  const childDepth = depth + 1;
  if (childDepth > JSON_MAX_NESTING) {
    // Ruby's own wording, built from the constant so the two cannot drift:
    // `JSON::NestingError: nesting of 100 is too deep`.
    throw new Error(`nesting of ${JSON_MAX_NESTING} is too deep`);
  }
  return childDepth;
}

export function normalize(input: string): { text: string; map: SourceMap } {
  try {
    return preprocess(input);
  } catch (error) {
    throw asParseError(error, input);
  }
}

export function asParseError(error: unknown, input: string): ParseError {
  if (error instanceof ParseError) return error;
  return new ParseError(
    error instanceof Error ? error.message : describeThrown(error),
    input,
    "html",
    0,
  );
}

/** Apply the source JSON-tree boundary and the shared Formula mapper. */
export function transformHtmlTree(tree: ParseValue, input: string): FormulaNode {
  try {
    return finalizeHtmlParse(htmlTransform().apply(plainTree(tree)), input);
  } catch (error) {
    throw asParseError(error, input);
  }
}
