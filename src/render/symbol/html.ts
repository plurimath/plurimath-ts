/**
 * Mirrors `symbols/symbol.rb` — `Symbols::Symbol#to_html` (:62-64) — for the
 * base class, and the generated per-id literals for the 1,459 subclasses the
 * census folds into this kind (ARCHITECTURE.md §5, "Symbols").
 *
 * Measured pins (pinned oracle 00c52783, plurimath 0.11.6; live probes on
 * instantiated classes, exit 0):
 *
 *   - base `Symbol#to_html` is the stored value and nothing else — no
 *     `specific_values` branch like `to_latex`'s, so `"{:"` renders as
 *     `"{:"`, `""` as `""`, and a nil value stays Ruby-nil;
 *   - the abstract `Paren` carrier inherits that unchanged
 *     (`Paren.new.to_html` is nil, `Paren.new("x").to_html` is `"x"`);
 *   - subclasses IGNORE a constructor value override — `Plus.new("ZZ")`,
 *     `Comma.new("ZZ")` and `Sigma.new("ZZ")` each answer their static
 *     string. So unlike mathml, HTML has no value-dependent id, which is
 *     what the generator's own census records
 *     (`generated/context-axes.ts`, `VALUE_DEPENDENT_SYMBOLS` names `Comma`
 *     and `Plus` for `mathml` only);
 *   - the generated HTML exception matrix
 *     (`src/generated/html/exceptions.ts`) is empty — no symbol varies on
 *     any manifested axis — so there is no context consultation here and the
 *     context parameter is dropped, exactly as in the latex twin.
 *
 * This table is NOT the payload the fenced named-paren slot needs; that slot
 * reads a MathML-owned value, and `../fenced/html.ts` carries the
 * measurement.
 */

import { RUBY_ABSTRACT_CLASSES } from "../../core/nodes";
import { NODE_SPECS } from "../../core/normalize";
import {
  classBasename,
  missingSymbolDataError,
  type NodeOf,
} from "../../formats/html/render-shared";
import { HTML_SYMBOLS } from "../../generated/html/symbols";

/**
 * Symbol ids rendered from their stored `value` rather than a class literal:
 * the `Symbol` base class itself, and the abstract `Paren` root — the two ids
 * the generated table deliberately omits. Both are derived from core's own
 * data (the symbol spec's carrier class and the abstract-class census), not
 * restated.
 */
const VALUE_RENDERED_SYMBOL_IDS: ReadonlySet<string> = new Set(
  [NODE_SPECS.symbol.rubyClass, ...RUBY_ABSTRACT_CLASSES]
    .filter((rubyClass) => rubyClass.startsWith("Math::Symbols::"))
    .map(classBasename),
);

/** `Symbols::Symbol#to_html`: the stored value, unchanged; nil stays nil. */
export function renderSymbol(node: NodeOf<"symbol">): string | null {
  // A plain object without an id is the base class, exactly as the
  // constructor's default makes it.
  const id = node.id ?? classBasename(NODE_SPECS.symbol.rubyClass);
  if (VALUE_RENDERED_SYMBOL_IDS.has(id)) {
    const value = node.value;
    if (value !== null && value !== undefined) return value;
    return null;
  }
  const literal = HTML_SYMBOLS.get(id);
  // The factory records the error as this walk's own throw (a module-private
  // WeakSet), so the boundary can tell it from an input's imitation
  // (see `../../formats/html/render-shared.ts`).
  if (literal === undefined) throw missingSymbolDataError(id);
  return literal;
}
