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
import { renderOptionalChild, unicodemathParens } from "../../formats/unicodemath/render-shared";
import { UNICODEMATH_UNICODE_FRACTIONS } from "../../generated/unicodemath/render-tables";

export function renderFrac(node: NodeOf<"frac">, context: RenderContext): string | null {
  const options = node.options;

  if (options?.unicodemath_fraction !== undefined && options.unicodemath_fraction !== false) {
    return unicodeFraction(node);
  }

  const first =
    node.parameterOne === undefined ? "" : (unicodemathParens(node.parameterOne, context) ?? "");
  const second =
    node.parameterTwo === undefined ? "" : (unicodemathParens(node.parameterTwo, context) ?? "");

  // `return "#{first}/#{second}" unless self.options` — no options at all is
  // the ordinary fraction, and is checked before any key is looked at.
  if (options === undefined || options === null) return `${first}/${second}`;

  // U+00A6 BROKEN BAR.
  if ("linethickness" in options) return `${first}¦${second}`;
  // U+2298 CIRCLED DIVISION SLASH, and note it renders the children BARE —
  // no parens — unlike every other branch.
  if ("displaystyle" in options) {
    return `${renderOptionalChild(node.parameterOne, context)}⊘${renderOptionalChild(node.parameterTwo, context)}`;
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
  const match = /^\s*[+-]?\d+/.exec(value);
  return match === null ? 0 : Number.parseInt(match[0], 10);
}
