/**
 * Mirrors `function/frac.rb` — `Frac#to_unicodemath` (:73).
 *
 * The one kind that **returns nil on a reachable branch**: when the node has
 * options but none of `linethickness`, `displaystyle` or `ldiv`, the gem's
 * `elsif` chain falls off the end and yields nil. `{ choose: … }` is exactly
 * such a hash, and `Fenced` observes that nil by handling `choose` itself
 * before ever calling here.
 *
 * Options are the NODE's own, not the render options.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import { present, renderChild, unicodemathParens } from "../../formats/unicodemath/render-shared";
import { UNICODEMATH_UNICODE_FRACTIONS } from "../../generated/unicodemath/render-tables";

export function renderFrac(node: NodeOf<"frac">, context: RenderContext): string | null {
  const options = node.options;

  // `options&.dig(:unicodemath_fraction)` — truthiness. Excluding only `false`
  // still let `null` through, and the corpus never carries a null option.
  if (present(options?.unicodemath_fraction)) {
    return unicodeFraction(node);
  }

  const first = !present(node.parameterOne)
    ? ""
    : (unicodemathParens(node.parameterOne, context) ?? "");
  const second = !present(node.parameterTwo)
    ? ""
    : (unicodemathParens(node.parameterTwo, context) ?? "");

  // `return "#{first}/#{second}" unless self.options` — no options at all is
  // the ordinary fraction, and is checked before any key is looked at.
  if (options === undefined || options === null) return `${first}/${second}`;

  // U+00A6 BROKEN BAR.
  if ("linethickness" in options) return `${first}¦${second}`;
  // U+2298 CIRCLED DIVISION SLASH, and note it renders the children BARE —
  // no parens — unlike every other branch.
  if ("displaystyle" in options) {
    // Unguarded in the gem: `Frac.new(nil, x, {displaystyle: nil})` raises
    // NoMethodError rather than rendering "\u2298x". Note the branch is chosen by
    // `key?`, so a nil VALUE still selects it — presence and truthiness are
    // different tests and this line needs both readings to be right.
    return `${renderChild(node.parameterOne, context, "frac.parameterOne") ?? ""}⊘${renderChild(node.parameterTwo, context, "frac.parameterTwo") ?? ""}`;
  }
  // U+2215 DIVISION SLASH.
  if ("ldiv" in options) return `${first}∕${second}`;

  // Options present, none of the three keys: the gem yields nil here.
  return null;
}

/**
 * `Frac#unicodemath_fraction` (`frac.rb:157`) — a reverse lookup by the
 * [numerator, denominator] pair, which misses (and yields nil) for any pair
 * the table does not carry.
 */
function unicodeFraction(node: NodeOf<"frac">): string | null {
  const numerator = numericValue(node.parameterOne);
  const denominator = numericValue(node.parameterTwo);
  return UNICODEMATH_UNICODE_FRACTIONS.get(`${numerator}/${denominator}`) ?? null;
}

/**
 * Ruby's `String#to_i`: the leading integer literal, or 0 when there is none.
 *
 * "Leading digits" is not the whole grammar — `to_i` also accepts an underscore
 * BETWEEN two digits, exactly as an integer literal in Ruby source does, and
 * this used to stop at the first underscore. Measured on the pinned oracle
 * (0.11.6, 00c52783), across the spellings that separate the two readings:
 *
 *   "1_0"       => 10        "1__0"  => 1     (a doubled `_` ends the number)
 *   "1_2_3"     => 123       "1_2__3" => 12
 *   "1_000_000" => 1000000   "1_"    => 1     (a trailing `_` ends it)
 *   "_1"        => 0         "+_5"   => 0     (a leading `_` is not a digit)
 *   ".5"        => 0         "1.9"   => 1     "1_.5" => 1
 *   "+5"        => 5         "-5"    => -5    "+ 12" => 0   " +12" => 12
 *   "007"       => 7         "1e3"   => 1     "1 0"  => 1
 *   "0x10"      => 0         "0b11"  => 0     "0o17" => 0   (no base prefixes)
 *   "12abc"     => 12        "1_0abc" => 10   "abc"  => 0   ""     => 0
 *   "--5"       => 0         "+-5"   => 0     "٣"    => 0
 *
 * The divergence was reachable and it changed output, not just an internal
 * number: every pair in `UNICODE_FRACTIONS` is single-digit, so a numerator of
 * `"1_0"` misses the table in the gem (10/2) and returned nil, while stopping
 * at the underscore hit `1/2` and rendered `"&#xbd;"` — measured, both sides.
 *
 * The whitespace class is Ruby's, not JavaScript's: `to_i` skips
 * ` \t\n\v\f\r` and nothing else (measured, each one individually), where JS
 * `\s` would also swallow U+00A0, U+2009 and U+3000 — all three of which
 * `to_i` refuses, returning 0.
 *
 * One thing this cannot reproduce: Ruby's integers are arbitrary-precision, so
 * `"999999999999999999999".to_i` is exact where `Number.parseInt` rounds to
 * 1e21 (measured, both). It changes nothing observable here — `unicodeFraction`
 * above keys the lookup by the pair, every table pair is single-digit, and both
 * readings miss — but it is why the number is only ever built into a key.
 */
function numericValue(field: unknown): number {
  const value = (field as { readonly value?: unknown } | undefined)?.value;
  if (typeof value !== "string") return 0;
  const match = /^[ \t\r\n\f\v]*[+-]?\d+(?:_\d+)*/.exec(value);
  if (match === null) return 0;
  return Number.parseInt(match[0].replace(/_/g, ""), 10);
}
