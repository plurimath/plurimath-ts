import { type FormulaNode, ParseError } from "../../core/index";
import { ParseFailed, type ParseValue, type SourceMap } from "../../pegkit/index";
import {
  type LatexParseOptions,
  preprocessOrParseError,
  transformLatexTree,
  validateOptions,
} from "./consumer";

export type { LatexParseOptions } from "./consumer";

import { latexGrammar } from "./grammar";
export function parseLatexTree(input: string, options?: LatexParseOptions | null): ParseValue {
  validateOptions(options);
  const { text, map } = preprocessOrParseError(input);
  return parsePreprocessed(input, text, map, options);
}
export function parseLatex(input: string, options?: LatexParseOptions | null): FormulaNode {
  return transformLatexTree(parseLatexTree(input, options), input);
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
