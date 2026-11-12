import { type FormulaNode, ParseError } from "../../core/index";
import { ParseFailed, type ParseValue, type SourceMap } from "../../pegkit/index";
import {
  postProcessing,
  preprocessOrParseError,
  transformUnicodemathTree,
  type UnicodemathParseOptions,
  validateOptions,
} from "./consumer";

export type { UnicodemathParseOptions } from "./consumer";

import { parseUnicodemathPreprocessed } from "./grammar";

const FORMAT = "unicode";
export function parseUnicodemathTree(
  input: string,
  options?: UnicodemathParseOptions | null,
): ParseValue {
  validateOptions(options);
  const { text, label, map } = preprocessOrParseError(input);
  const tree = parsePreprocessed(input, text, map, options);
  return label === undefined ? tree : postProcessing(tree, label);
}
export function parseUnicodemath(
  input: string,
  options?: UnicodemathParseOptions | null,
): FormulaNode {
  return transformUnicodemathTree(parseUnicodemathTree(input, options), input);
}
function parsePreprocessed(
  input: string,
  text: string,
  map: SourceMap,
  options?: UnicodemathParseOptions | null,
): ParseValue {
  try {
    return parseUnicodemathPreprocessed(text, options);
  } catch (error) {
    if (error instanceof ParseFailed) {
      throw new ParseError(error.message, input, FORMAT, map.toOriginal(error.index));
    }
    throw error;
  }
}
