/**
 * Mirrors `symbols/symbol.rb` — `Symbols::Symbol#to_omml_without_math_tag`
 * (:67-72) and `#insert_t_tag` (:82-87) — for the base class, and the
 * generated per-id literals for the 1,459 subclasses the census folds into
 * this kind (ARCHITECTURE.md §5, "Symbols"). The lookup itself, and the
 * measurements behind it, are in `../../formats/omml/render-shared.ts`.
 */

import {
  type NodeOf,
  plainRun,
  type RenderContext,
  symbolOmmlValue,
  symbolValueOrGenerated,
} from "../../formats/omml/render-shared";
import type { XmlElement } from "../../xml/index";

/**
 * The one value the gem hard-codes out of both OMML paths
 * (`symbols/symbol.rb:69` and :84, each `return if value == "&#x2062;"`, both
 * carrying the same upstream TODO). It is a test on the STORED value, and no
 * named subclass's literal is this entity — measured over all 1,459 static
 * classes on the pinned oracle — so it can only ever fire for a base `Symbol`
 * or the abstract `Paren`.
 */
const INVISIBLE_TIMES_ENTITY = "&#x2062;";

/** `Symbols::Symbol#to_omml_without_math_tag`: the class literal, or the stored value. */
export function renderSymbol(node: NodeOf<"symbol">): string | null {
  const value = symbolOmmlValue(node, node.kind);
  return value === INVISIBLE_TIMES_ENTITY ? null : value;
}

/** `Symbols::Symbol#insert_t_tag`: one `m:r` containing one `m:t`. */
export function renderSymbolInserted(
  node: NodeOf<"symbol">,
  _context: RenderContext,
): XmlElement | null {
  if (node.value === INVISIBLE_TIMES_ENTITY) return null;
  return plainRun(symbolValueOrGenerated(node, node.kind));
}
