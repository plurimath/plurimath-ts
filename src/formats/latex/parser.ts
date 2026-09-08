/**
 * The LaTeX format entry point (ARCHITECTURE.md §4):
 * preprocess → grammar → transform → an immutable `FormulaNode`.
 *
 * The pipeline mirrors the gem's three layers exactly:
 *
 *   - `Latex::Parser#initialize` (`latex/parser.rb:10-13`) preprocesses in the
 *     CONSTRUCTOR, so `#text` is already normalised before `#parse` runs.
 *   - `Latex::Parser#parse` (`:15-21`): parse the preprocessed text, apply the
 *     transform, box a non-array, and wrap the result in `Math::Formula.new`.
 *     Note the wrap is UNCONDITIONAL — unlike AsciiMath's, which keeps a
 *     formula the transform already produced. A LaTeX formula is therefore
 *     always one level deeper than the transform's own output.
 *   - `Plurimath::Math.parse_formula` (`math.rb:62-66`): the returned formula
 *     carries `input_string` — the CALLER's text, not the preprocessed form.
 *
 * Failure positions: `ParseFailed.index` is an offset into the preprocessed
 * text, and preprocessing changes lengths almost everywhere, so every position
 * is mapped back through the `SourceMap` before it reaches a caller as
 * `ParseError.index` (§5).
 *
 * The gem lets `Parslet::ParseFailed` escape uncaught — there is no `rescue`
 * anywhere under `lib/plurimath/latex/` — and `Plurimath::Math.parse` turns it
 * into a `ParseError` at the public boundary (`math.rb:44-48`). That is the
 * boundary this function stands at, so a refusal is a `ParseError`.
 */

import { type FormulaNode, type OnUnsupported, ParseError } from "../../core/index";
import type { LocaleOptions } from "../../formatting/index";
import { ParseFailed, type ParseValue, type SourceMap } from "../../pegkit/index";
import { latexGrammar } from "./grammar";
import { preprocess } from "./preprocess";
import { buildLatexTransform, finalizeLatexParse } from "./transform";

/**
 * Locale (the decimal marker the grammar reads at parse time) plus the
 * deferred-construct hook §5 promises on every parser.
 *
 * `onUnsupported` is accepted and never fired today: `latex/parse.rb` has no
 * commented-out alternative and no construct this port declines, unlike
 * AsciiMath's UnitsML branch. It is in the signature so the shape matches the
 * other parsers rather than to describe a behaviour that exists.
 */
export interface LatexParseOptions extends LocaleOptions {
  readonly onUnsupported?: OnUnsupported;
}

/**
 * Preprocesses and parses LaTeX into the raw Parslet-shaped tree — the
 * pipeline's first half, exposed for the grammar and preprocessing suites.
 * `ParseError.index` already indexes the ORIGINAL input here.
 */
export function parseLatexTree(input: string, options?: LatexParseOptions | null): ParseValue {
  const { text, map } = preprocess(input);
  return parsePreprocessed(input, text, map, options);
}

/**
 * `Plurimath::Math.parse(input, :latex)`'s observable result.
 *
 * The transform is wrapped as well as the grammar, because `Plurimath::Math.parse`
 * wraps everything (`math.rb:44-48`):
 *
 * ```ruby
 * rescue ParseError
 *   raise
 * rescue StandardError
 *   raise ParseError.new(text, type), cause: nil
 * ```
 *
 * That is not theoretical here. `Utility.get_class` raises `NameError` on a
 * name with no class — `Pr` is a `MATH_OPERATORS` entry with no
 * `Math::Function::Pr` — so `\Pr_1` reaches the gem's public boundary as a
 * `ParseError`, and the fixture set records it as one. Without this arm the
 * port would surface the registry's own `Error` instead, and a caller
 * branching on `code` would miss it.
 *
 * The failure is attributed to offset 0: unlike a grammar failure, a transform
 * failure carries no position — the gem's own `ParseError` for these has none
 * either.
 */
export function parseLatex(input: string, options?: LatexParseOptions | null): FormulaNode {
  const { text, map } = preprocess(input);
  const tree = parsePreprocessed(input, text, map, options);
  try {
    const transformed = buildLatexTransform().transform.apply(tree);
    return finalizeLatexParse(transformed, input);
  } catch (error) {
    if (error instanceof ParseError) throw error;
    throw new ParseError(error instanceof Error ? error.message : String(error), input, "latex", 0);
  }
}

function parsePreprocessed(
  input: string,
  text: string,
  map: SourceMap,
  options?: LatexParseOptions | null,
): ParseValue {
  try {
    return latexGrammar(options ?? undefined).root.parse(text);
  } catch (error) {
    if (error instanceof ParseFailed) {
      throw new ParseError(error.message, input, "latex", map.toOriginal(error.index));
    }
    throw error;
  }
}
