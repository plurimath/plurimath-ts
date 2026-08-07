/**
 * Mirrors `function/color.rb` — `Color#to_latex` (:41): the first slot
 * through `to_asciimath` with `/\s/` stripped (ASCII whitespace — the
 * no-break space stays); the second through `to_latex`; both nil-safe.
 *
 * The one render that crosses into asciimath: this file duplicates the
 * minimal asciimath fragment that path needs (base symbols, numbers, quoted
 * text, formula joins, plus the symbol ids the corpus+sweep exercise) rather
 * than importing the asciimath format (ARCHITECTURE.md §3, no cross-format
 * imports); an unmeasured operand raises rather than diverging.
 */

import { RenderError } from "../../core/index";
import { NODE_SPECS } from "../../core/normalize";
import {
  classBasename,
  describeSlot,
  FORMAT,
  interpolatedValue,
  isNode,
  type NodeOf,
  nilSafe,
  type RenderContext,
  s,
  stripRubyWhitespace,
} from "../../formats/latex/render-shared";
import { LATEX_COLOR_ASCIIMATH_SYMBOLS } from "../../generated/latex/render-tables";
import { VALUE_RENDERED_SYMBOL_IDS } from "../symbol/latex";

/**
 * The asciimath renders `Color#to_latex` needs for its first slot, for the
 * symbol ids the corpus+sweep actually put there — generated per id and
 * verified through a full Color render. Kept deliberately minimal — an id
 * outside this table raises a parity-gap RenderError rather than guessing —
 * because the full asciimath symbol table belongs to the asciimath format
 * (§3, no cross-format tables).
 */
const COLOR_ASCIIMATH_SYMBOLS: ReadonlyMap<string, string> = LATEX_COLOR_ASCIIMATH_SYMBOLS;

export function renderColor(node: NodeOf<"color">, context: RenderContext): string {
  // `Color#to_latex` (`color.rb:41`): the first slot through to_asciimath
  // with `/\s/` stripped; the second through to_latex; both nil-safe.
  const one =
    node.parameterOne === null || node.parameterOne === undefined
      ? ""
      : stripRubyWhitespace(s(colorAsciimathValue(node.parameterOne, "color.parameterOne")));
  const two = nilSafe(node.parameterTwo, context, "color.parameterTwo");
  return `{\\color{${one}} ${two}}`;
}

/**
 * The minimal `to_asciimath` fragment `Color`'s first slot needs, duplicated
 * from the asciimath renderer rather than imported (§3; see the module
 * header). Every branch is oracle-measured (probe_tables.rb `color/*`); an
 * operand outside them is a parity gap and raises.
 */
function colorAsciimathValue(value: unknown, at: string): string | null {
  if (!isNode(value)) {
    throw new RenderError(
      `${at}: cannot render ${describeSlot(value)} — the gem raises NoMethodError here`,
      FORMAT,
      "color",
    );
  }
  switch (value.kind) {
    case "symbol": {
      const id = value.id ?? classBasename(NODE_SPECS.symbol.rubyClass);
      if (VALUE_RENDERED_SYMBOL_IDS.has(id)) {
        // `Symbols::Symbol#to_asciimath`: `value.nil? ? "" : value`.
        return interpolatedValue(value.value, "color", at);
      }
      const literal = COLOR_ASCIIMATH_SYMBOLS.get(id);
      if (literal !== undefined) return literal;
      throw new RenderError(
        `color.parameterOne: no measured asciimath value for symbol id "${id}" — ` +
          "the gem renders this slot through to_asciimath, and this renderer " +
          "carries only the measured slice (see COLOR_ASCIIMATH_SYMBOLS).",
        FORMAT,
        "color",
      );
    }
    case "number":
      return interpolatedValue(value.value, "color", at);
    case "text": {
      // `Text#to_asciimath`: quoted, `unicode[:name]` unwrapped.
      const text = value.parameterOne;
      if (text === null || text === undefined) return '""';
      if (typeof text !== "string") {
        throw new RenderError(
          `${at}: text holds ${describeSlot(text)} — the gem raises NoMethodError here`,
          FORMAT,
          "color",
        );
      }
      return `"${text.replace(/unicode\[:(\w+)\]/g, "$1")}"`;
    }
    case "formula":
    case "mrow": {
      const list = value.value;
      if (!Array.isArray(list)) {
        throw new RenderError(
          `${at}.value: is ${describeSlot(list)}, not a list — the gem raises NoMethodError here`,
          FORMAT,
          "color",
        );
      }
      return list.map((item) => s(colorAsciimathValue(item, `${at}.value`))).join(" ");
    }
    default:
      throw new RenderError(
        `color.parameterOne: no measured asciimath rendering for a "${value.kind}" node — ` +
          "the gem renders this slot through to_asciimath, and this renderer " +
          "carries only the measured fragment (see colorAsciimathValue).",
        FORMAT,
        "color",
      );
  }
}
