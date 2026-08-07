/**
 * Mirrors `symbols/symbol.rb` — `Symbols::Symbol#to_latex` (:56) and
 * `#specific_values` (:246) — for the base class, and the generated per-id
 * literals for the 1,459 subclasses the census folds into this kind
 * (ARCHITECTURE.md §5, "Symbols"). The generated LaTeX exception matrix
 * (`src/generated/latex/exceptions.ts`) is empty — no symbol varies on any
 * manifested axis — so unlike the asciimath twin there is no context
 * consultation here, and the context parameter is dropped.
 */

import { MissingSymbolDataError } from "../../core/index";
import { RUBY_ABSTRACT_CLASSES } from "../../core/nodes";
import { NODE_SPECS } from "../../core/normalize";
import {
  classBasename,
  FORMAT,
  interpolatedValue,
  type NodeOf,
} from "../../formats/latex/render-shared";
import { LATEX_SYMBOLS } from "../../generated/latex/symbols";

/**
 * Symbol ids rendered from their stored `value` rather than a class literal:
 * the `Symbol` base class itself, and the abstract `Paren` root — the two
 * ids the generated table deliberately omits. Both are derived from core's
 * own data (the symbol spec's carrier class and the abstract-class census),
 * not restated. Exported for `../color/latex.ts`, whose asciimath fragment renders
 * the same base classes from their stored value.
 */
export const VALUE_RENDERED_SYMBOL_IDS: ReadonlySet<string> = new Set(
  [NODE_SPECS.symbol.rubyClass, ...RUBY_ABSTRACT_CLASSES]
    .filter((rubyClass) => rubyClass.startsWith("Math::Symbols::"))
    .map(classBasename),
);

export function renderSymbol(node: NodeOf<"symbol">): string | null {
  // A plain object without an id is the base class, exactly as the
  // constructor's default makes it.
  const id = node.id ?? classBasename(NODE_SPECS.symbol.rubyClass);
  if (VALUE_RENDERED_SYMBOL_IDS.has(id)) {
    // `Symbols::Symbol#to_latex` (`symbols/symbol.rb:56`): `specific_values`
    // first, then the raw value — nil stays Ruby-nil. `Paren` inherits it
    // unchanged (measured).
    const value = node.value;
    if (value === null || value === undefined) return null;
    const text = interpolatedValue(value, node.kind, "symbol.value");
    if (text === "{:" || text === ":}") return "";
    if (text === "{" || text === "}" || text === "_") return `\\${text}`;
    if (text === "if") return "\\operatorname{if}";
    return text;
  }
  const literal = LATEX_SYMBOLS.get(id);
  if (literal === undefined) throw new MissingSymbolDataError(id, FORMAT);
  return literal;
}
