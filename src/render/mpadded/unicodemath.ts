/**
 * Mirrors `function/mpadded.rb` — `Mpadded#to_unicodemath` (:50).
 *
 * Three branches, all reading the NODE's own options.
 *
 * The first does a reverse lookup keyed by the *whole* options hash
 * (`PHANTOM_SYMBOLS.key(options)`, `mpadded.rb:101`) and then indexes
 * `UNARY_SYMBOLS` with the result. Ruby compares hashes by content, so the
 * generator emits that table keyed by a canonical serialization with sorted
 * keys — the port does a string lookup rather than reimplementing Ruby hash
 * equality, and insertion order cannot change the answer.
 *
 * Both lookups can miss, and the gem propagates the nil into the output as an
 * empty interpolation rather than failing.
 */

import type { NodeOf, RenderContext } from "../../formats/unicodemath/render-shared";
import {
  present,
  renderOptionalChild,
  rubyInterpolate,
  unicodemathParens,
} from "../../formats/unicodemath/render-shared";
import {
  UNICODEMATH_PHANTOM_SYMBOLS,
  UNICODEMATH_UNARY_SYMBOLS,
} from "../../generated/unicodemath/render-tables";

/** U+27E1 WHITE CONCAVE-SIDED DIAMOND. */
const MPADDED = "⟡";

export function renderMpadded(node: NodeOf<"mpadded">, context: RenderContext): string {
  const options = node.options;

  // `options&.dig(:mpadded)` — truthiness, so nil and false both fall through.
  // Options checked first so the narrowing reaches `phantomGlyph`.
  if (options !== undefined && options !== null && present(options.mpadded)) {
    return `${phantomGlyph(options)}${unicodemathParens(node.parameterOne, context) ?? ""}`;
  }
  if (options !== undefined && options !== null && "mask" in options) {
    // `"⟡(#{self.options[:mask]}&...)"` — Ruby interpolation, so `to_s` on
    // whatever the option holds. `String()` is not that: measured, the gem
    // gives `⟡(["x", 2]&x)` for an array where `String()` gives `x,2`, and
    // `⟡(1.0&x)` for a float. `rubyInterpolate` is the shared helper written
    // for exactly this, and this call site was missed when it landed.
    return `${MPADDED}(${rubyInterpolate(options.mask)}&${renderOptionalChild(node.parameterOne, context)})`;
  }
  if (!present(node.parameterOne)) return MPADDED;

  return `${MPADDED}(${renderOptionalChild(node.parameterOne, context)})`;
}

/** `mpadded_symbol` then `mpadded_unicode` (`mpadded.rb:101`, `:105`). */
function phantomGlyph(options: Record<string, unknown>): string {
  const name = UNICODEMATH_PHANTOM_SYMBOLS.get(canonicalKey(options));
  if (name === undefined) return "";
  return UNICODEMATH_UNARY_SYMBOLS.get(name) ?? "";
}

/** The generator's key shape: sorted keys, nested hashes serialized the same way. */
function canonicalKey(value: unknown): string {
  // The TYPE is part of the key. Ruby hash equality distinguishes `0` from
  // `"0"`, so `{width: 0}` and `{width: "0"}` are different keys and only one
  // of them is in `PHANTOM_SYMBOLS`. Serializing both to `0` made a numeric
  // width select the string-keyed entry — measured: the gem renders `(x)` for
  // the integer form and `&#x21f3;(x)` for the string form, and this port gave
  // the arrow for both.
  if (value === null || value === undefined) return `nil:${String(value)}`;
  if (typeof value !== "object") return `${typeof value}:${String(value)}`;
  if (Array.isArray(value)) {
    return `array:[${value.map((entry) => canonicalKey(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([key, inner]) => `${key}:${canonicalKey(inner)}`).join(",")}}`;
}
