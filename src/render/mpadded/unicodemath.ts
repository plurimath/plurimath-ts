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

  if (options?.mpadded !== undefined && options.mpadded !== false) {
    return `${phantomGlyph(options)}${unicodemathParens(node.parameterOne, context) ?? ""}`;
  }
  if (options !== undefined && options !== null && "mask" in options) {
    return `${MPADDED}(${String(options.mask ?? "")}&${renderOptionalChild(node.parameterOne, context)})`;
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
  if (value === null || typeof value !== "object" || Array.isArray(value)) return String(value);

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  return `{${entries.map(([key, inner]) => `${key}:${canonicalKey(inner)}`).join(",")}}`;
}
