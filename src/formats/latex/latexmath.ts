/**
 * Caller-initialized latexmath-ts stage; no runtime loading or fallback.
 *
 * As plurimath's `Latex::Parser#parse` (main bab7f52): latexmath parses the
 * caller's input into its typed model (`Latexmath::Model::Document`), and
 * `./mapper` turns the model into the capture tree the LaTeX rule table
 * builds the formula from. A refusal is a `ParseError` at latexmath's
 * position, which it reports as a UTF-8 byte offset into the caller's input.
 */
import { type FormulaNode, ParseError } from "../../core/index";
import { decimalMarkerFor } from "../../formatting/index";
import { bytePositions, isStageParseError, positionAt } from "../../pegkit/stage-captures";
import {
  type LatexParseOptions,
  preprocessOrParseError,
  transformLatexTree,
  validateOptions,
} from "./consumer";
import { type LatexmathDocument, latexmathCaptures, latexmathExpression } from "./mapper";

export type { LatexParseOptions } from "./consumer";
export type { LatexmathDocument } from "./mapper";
export interface LatexStageBinding {
  /** latexmath-ts `Parser#parse`: the typed model of the caller's input. */
  parse(input: string, options: { decimal: string }): LatexmathDocument;
}
export function createLatexParser(
  binding: LatexStageBinding,
): (input: string, options?: LatexParseOptions | null) => FormulaNode {
  return (input, options) => {
    validateOptions(options);
    // Ruby runs the same preprocessing when it builds the parser (#text); an
    // undecodable entity is refused there, at its offset, before latexmath runs.
    const { map } = preprocessOrParseError(input);
    let document: LatexmathDocument;
    try {
      document = binding.parse(input, { decimal: decimalMarkerFor(options?.locale) });
    } catch (error) {
      if (isStageParseError(error))
        throw new ParseError(
          error.message,
          input,
          "latex",
          error.byteOffset === null ? 0 : positionAt(bytePositions(input), error.byteOffset),
        );
      throw error;
    }
    const expression = latexmathExpression(document);
    // Input without a formula (empty, or only spaces and newlines) is a
    // refusal at the start of the preprocessed text, mapped back into the
    // caller's input like every other LaTeX refusal.
    if (expression === null)
      throw new ParseError("LaTeX input has no formula", input, "latex", map.toOriginal(0));
    return transformLatexTree(latexmathCaptures(expression), input);
  };
}
