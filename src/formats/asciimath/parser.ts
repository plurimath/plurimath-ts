/**
 * The AsciiMath format entry point (ARCHITECTURE.md §4):
 * preprocess → grammar → transform → an immutable `FormulaNode`.
 *
 * The pipeline mirrors the gem's two layers exactly:
 *
 *   - `Asciimath::Parser#parse` (`asciimath/parser.rb:17-23`): parse the preprocessed
 *     text, apply the transform, and wrap anything that is not already a
 *     formula in `Formula.new` — including its quirks (a non-array is boxed,
 *     and a leading `Left` clears `left_right_wrapper`).
 *   - `Plurimath::Math.parse_formula` (`math.rb:62-66`): the returned formula
 *     carries `input_string` — the CALLER's text, not the preprocessed form.
 *
 * Failure positions use the root-prefix boundary in the preprocessed text.
 * Four of the five preprocessing rewrites change lengths, so every
 * position is mapped back through the `SourceMap` before it reaches a caller
 * as `ParseError.index` (§5). `test/formats/asciimath/failure-parity.spec.ts`
 * pins that contract against the gem's 156-input failure sweep; this module
 * is the composition that spec used to carry as a local helper.
 */

import { type FormulaNode, ParseError } from "../../core/index";
import { ParseFailed, type ParseValue, type SourceMap } from "../../pegkit/index";
import {
  type AsciimathParseOptions,
  ambiguousUncertaintyComma,
  transformAsciimathTree,
  validateOptions,
} from "./consumer";

export type { AsciimathParseOptions } from "./consumer";

import { asciimathGrammar } from "./grammar";
import { preprocess } from "./preprocess";

/**
 * Parses AsciiMath into the raw Parslet-shaped tree — the pipeline's first
 * half, exposed for the failure-parity suite, which compares trees the gem's
 * Parslet layer produced. `ParseError.index` already indexes the ORIGINAL
 * input here; `parseAsciimath` builds on this and adds the transform.
 */
export function parseAsciimathTree(
  input: string,
  options?: AsciimathParseOptions | null,
): ParseValue {
  validateOptions(options);
  const { text, map } = preprocess(input);
  return parsePreprocessed(input, text, map, options);
}

/** `Plurimath::Math.parse(input, :asciimath)`'s observable result. */
export function parseAsciimath(input: string, options?: AsciimathParseOptions | null): FormulaNode {
  validateOptions(options);
  const { text, map } = preprocess(input);
  ambiguousUncertaintyComma(input, text, options);
  const tree = parsePreprocessed(input, text, map, options);
  return transformAsciimathTree(tree, input);
}

function parsePreprocessed(
  input: string,
  text: string,
  map: SourceMap,
  options?: AsciimathParseOptions | null,
): ParseValue {
  const grammar = asciimathGrammar(options ?? undefined);
  try {
    return grammar.root.parse(text);
  } catch (error) {
    // amath reports the deepest leaf of the root's failure cause, which is
    // pegkit's `ParseFailed.index`; it indexes the preprocessed text.
    if (error instanceof ParseFailed)
      throw new ParseError(error.message, input, "asciimath", map.toOriginal(error.index));
    throw error;
  }
}
