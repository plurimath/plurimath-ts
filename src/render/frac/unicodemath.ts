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
import {
  present,
  renderChild,
  renderOptionalChild,
  unicodemathParens,
} from "../../formats/unicodemath/render-shared";
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

/** Ruby's `String#to_i`: leading digits, or 0 when there are none. */
function numericValue(field: unknown): number {
  const value = (field as { readonly value?: unknown } | undefined)?.value;
  if (typeof value !== "string") return 0;
  // Ruby's `\s` is ASCII only; JS `\s` also matches U+00A0 and U+2009, which
  // `String#to_i` does NOT skip — it returns 0 for those.
  const match = /^[ \t\r\n\f\v]*[+-]?\d+/.exec(value);
  return match === null ? 0 : Number.parseInt(match[0], 10);
}
