/**
 * Mirrors `symbols/symbol.rb` — `Symbols::Symbol#to_asciimath` (:34) — for
 * the base class, and the generated per-id literals plus context-exception
 * matrix for the 1,459 subclasses the census folds into this kind
 * (ARCHITECTURE.md §5, "Symbols").
 */

import { MissingSymbolDataError, RenderError } from "../../../core/index";
import { RUBY_ABSTRACT_CLASSES } from "../../../core/nodes";
import { NODE_SPECS } from "../../../core/normalize";
import { ASCIIMATH_SYMBOL_EXCEPTIONS } from "../../../generated/asciimath/exceptions";
import { ASCIIMATH_SYMBOLS } from "../../../generated/asciimath/symbols";
import {
  classBasename,
  FORMAT,
  interpolatedValue,
  type NodeOf,
  type RenderContext,
} from "./shared";

/**
 * Symbol ids rendered from their stored `value` rather than a class literal:
 * the `Symbol` base class itself, and the abstract `Paren` root — the two
 * ids the generated table deliberately omits. Both are derived from core's
 * own data (the symbol spec's carrier class and the abstract-class census),
 * not restated.
 */
const VALUE_RENDERED_SYMBOL_IDS: ReadonlySet<string> = new Set(
  [NODE_SPECS.symbol.rubyClass, ...RUBY_ABSTRACT_CLASSES]
    .filter((rubyClass) => rubyClass.startsWith("Math::Symbols::"))
    .map(classBasename),
);

const SYMBOL_EXCEPTIONS = new Map(
  ASCIIMATH_SYMBOL_EXCEPTIONS.map((exception) => [exception.id, exception]),
);

export function renderSymbol(node: NodeOf<"symbol">, context: RenderContext): string {
  // A plain object without an id is the base class, exactly as the
  // constructor's default makes it.
  const id = node.id ?? classBasename(NODE_SPECS.symbol.rubyClass);
  if (VALUE_RENDERED_SYMBOL_IDS.has(id)) {
    // `Symbols::Symbol#to_asciimath`: `value.nil? ? "" : value`. `Paren`
    // inherits it unchanged (measured).
    return interpolatedValue(node.value, node.kind, "symbol.value");
  }
  const exception = SYMBOL_EXCEPTIONS.get(id);
  if (exception !== undefined) {
    const axes: Record<string, boolean> = { table: context.table };
    for (const variant of exception.variants) {
      if (
        Object.entries(variant.when).every(([axis, expected]) => {
          const actual = axes[axis];
          if (actual === undefined) {
            throw new RenderError(
              `symbol "${id}": exception matrix names axis "${axis}", which this renderer does not model`,
              FORMAT,
              node.kind,
            );
          }
          return actual === expected;
        })
      ) {
        return variant.value;
      }
    }
    // No variant claimed this context; fall through to the static value.
  }
  const literal = ASCIIMATH_SYMBOLS.get(id);
  if (literal === undefined) throw new MissingSymbolDataError(id, FORMAT);
  return literal;
}
