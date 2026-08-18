/**
 * Mirrors `symbols/symbol.rb` — `Symbols::Symbol#to_unicodemath` (:74), plus
 * the ~900 subclass overrides the generated table stands in for.
 *
 * Almost every concrete symbol class overrides this with a one-line
 * `Utility.html_entity_to_unicode("&#xNNNN;")`. Those are measured into
 * `src/generated/unicodemath/symbols.ts`, so a named symbol is a lookup here
 * rather than 900 files. The body below is the *base* implementation, which
 * only runs for a generic `Symbols::Symbol` carrying its own value.
 *
 * Note the signature in the gem is `to_unicodemath(**)` — it takes no options,
 * which is why no axis reaches a symbol and the exception matrix is empty.
 */

import type { NodeOf } from "../../formats/unicodemath/render-shared";
import { missingSymbol } from "../../formats/unicodemath/render-shared";
import {
  UNICODEMATH_SUB_ALPHABETS,
  UNICODEMATH_SUB_OPERATORS,
  UNICODEMATH_SUB_PARENTHESIS,
  UNICODEMATH_SUP_ALPHABETS,
  UNICODEMATH_SUP_OPERATORS,
  UNICODEMATH_SUP_PARENTHESIS,
} from "../../generated/unicodemath/render-tables";
import { UNICODEMATH_SYMBOLS } from "../../generated/unicodemath/symbols";

/** `special_chars` (`symbol.rb:276`). */
const SPECIAL = new Set(["&", "@", "^"]);

export function renderSymbol(node: NodeOf<"symbol">): string | null {
  // A named class: its override is what the generated table recorded.
  const named = UNICODEMATH_SYMBOLS.get(node.id);
  if (named !== undefined) return named;

  const value = node.value;
  if (value === null || value === undefined) {
    // `Paren` and `Symbol` are the two ids with no static value, and a generic
    // symbol with no value of its own has nothing to render.
    if (node.id === "Paren" || node.id === "Symbol") return null;
    throw missingSymbol(node.id);
  }

  if (node.slashed === true || SPECIAL.has(value)) return `\\${value}`;
  if (node.miniSubSized === true) return miniSub(value);
  if (node.miniSupSized === true) return miniSup(value);

  return value;
}

/**
 * `mini_sub` (`symbol.rb:254`) — alphabets, then operators, then the flattened
 * parenthesis table, and **nil** when none of the three carries the value. The
 * gem yields nil there rather than falling back to the value itself.
 */
function miniSub(value: string): string | null {
  return (
    UNICODEMATH_SUB_ALPHABETS.get(value) ??
    UNICODEMATH_SUB_OPERATORS.get(value) ??
    UNICODEMATH_SUB_PARENTHESIS.get(value) ??
    null
  );
}

/** `mini_sup` (`symbol.rb:260`), the same three tables on the superscript side. */
function miniSup(value: string): string | null {
  return (
    UNICODEMATH_SUP_ALPHABETS.get(value) ??
    UNICODEMATH_SUP_OPERATORS.get(value) ??
    UNICODEMATH_SUP_PARENTHESIS.get(value) ??
    null
  );
}
