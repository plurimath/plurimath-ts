/**
 * The AsciiMath format entry point (ARCHITECTURE.md §4):
 * preprocess → amath stage → transform → an immutable `FormulaNode`.
 *
 * This follows Ruby's `Asciimath::Parser#parse` after plurimath 8898451d:
 * the shared amath grammar parses the preprocessed text, the stage's
 * Renester and wrapper table produce the Parslet-shaped captures, and the
 * ported `Mapper::Rules` (`transform.ts`) build the formula. The returned
 * formula carries the CALLER's text as `input_string` (`math.rb:62-66`).
 *
 * Failure positions come from the stage as UTF-8 byte offsets into the
 * preprocessed text and are mapped back through the `SourceMap` before they
 * reach a caller as `ParseError.index` (§5).
 */

import type { FormulaNode } from "../../core/index";
import type { ParseValue } from "../../pegkit/index";
import { parseStageTree } from "./amath";
import { type AsciimathParseOptions, transformAsciimathTree } from "./consumer";
import { asciimathStageBinding } from "./stage";

export type { AsciimathParseOptions } from "./consumer";

/**
 * Parses AsciiMath into the raw Parslet-shaped tree, the pipeline's first
 * half. `ParseError.index` already indexes the ORIGINAL input here.
 */
export function parseAsciimathTree(
  input: string,
  options?: AsciimathParseOptions | null,
): ParseValue {
  return parseStageTree(asciimathStageBinding, input, options);
}

/** `Plurimath::Math.parse(input, :asciimath)`'s observable result. */
export function parseAsciimath(input: string, options?: AsciimathParseOptions | null): FormulaNode {
  return transformAsciimathTree(parseAsciimathTree(input, options), input);
}
