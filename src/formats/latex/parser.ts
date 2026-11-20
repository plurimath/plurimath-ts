import { ParseError } from "../../core/index";
import type { ParseValue, SourceMap } from "../../pegkit/index";
import { type LatexParseOptions, preprocessOrParseError, validateOptions } from "./consumer";

export type { LatexParseOptions } from "./consumer";

import { decimalMarkerFor } from "../../formatting/index";
import {
  bytePositions,
  copyCaptures,
  isStageParseError,
  positionAt,
} from "../../pegkit/stage-captures";
import { createLatexParser } from "./latexmath";
import { latexStage } from "./stage";
export function parseLatexTree(input: string, options?: LatexParseOptions | null): ParseValue {
  validateOptions(options);
  const { text, map } = preprocessOrParseError(input);
  return parsePreprocessed(input, text, map, options);
}
export const parseLatex = createLatexParser({
  parse: (input, { decimal }) => latexStage().parse(input, { decimal: decimal as "." | "," | "٫" }),
});
function parsePreprocessed(
  input: string,
  text: string,
  map: SourceMap,
  options?: LatexParseOptions | null,
): ParseValue {
  try {
    const tree = latexStage().parsePreparedTree(text, {
      decimal: decimalMarkerFor(options?.locale) as "." | "," | "٫",
    });
    return copyCaptures(tree, text, bytePositions(text));
  } catch (error) {
    if (isStageParseError(error)) {
      throw new ParseError(
        error.message,
        input,
        "latex",
        map.toOriginal(
          error.byteOffset === null ? 0 : positionAt(bytePositions(text), error.byteOffset),
        ),
      );
    }
    throw error;
  }
}
