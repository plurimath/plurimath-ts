import { ParseError } from "../../core/index";
import type { ParseValue, SourceMap } from "../../pegkit/index";
import {
  postProcessing,
  preprocessOrParseError,
  type UnicodemathParseOptions,
  validateOptions,
} from "./consumer";

export type { UnicodemathParseOptions } from "./consumer";

import artifact from "@plurimath/umath-ts/artifacts/umath.json" with { type: "json" };
import { decimalMarkerFor } from "../../formatting/index";
import {
  bytePositions,
  copyCaptures,
  isStageParseError,
  positionAt,
} from "../../pegkit/stage-captures";
import { unicodemathStage } from "./stage";
import { createUnicodemathParser } from "./umath";

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
export const parseUnicodemath = createUnicodemathParser(
  {
    parse: (input, options) => unicodemathStage().parse(input, options),
  },
  artifact,
);
function parsePreprocessed(
  input: string,
  text: string,
  map: SourceMap,
  options?: UnicodemathParseOptions | null,
): ParseValue {
  try {
    const tree = unicodemathStage().parsePreparedTree(text, {
      decimal: decimalMarkerFor(options?.locale) as "." | "," | "٫",
      compatibility: "parslet",
      reporter: "deepest",
    });
    return copyCaptures(tree, text, bytePositions(text));
  } catch (error) {
    if (isStageParseError(error)) {
      throw new ParseError(
        error.message,
        input,
        FORMAT,
        map.toOriginal(
          error.byteOffset === null ? 0 : positionAt(bytePositions(text), error.byteOffset),
        ),
      );
    }
    throw error;
  }
}
