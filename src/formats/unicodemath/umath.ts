/** Caller-initialized shared PARG/WASM stage; no runtime loading or fallback. */
import { type FormulaNode, ParseError } from "../../core/index";
import { decimalMarkerFor } from "../../formatting/index";
import {
  bytePositions,
  copyCaptures,
  isStageParseError,
  positionAt,
  type StageCapture,
} from "../../pegkit/stage-captures";
import {
  postProcessing,
  preprocessOrParseError,
  transformUnicodemathTree,
  type UnicodemathParseOptions,
  validateOptions,
} from "./consumer";

export type { UnicodemathParseOptions } from "./consumer";
export interface UnicodemathStageBinding {
  parsePreparedTree(input: string, options: { decimal: string }): StageCapture;
}
export function createUnicodemathParser(
  binding: UnicodemathStageBinding,
): (input: string, options?: UnicodemathParseOptions | null) => FormulaNode {
  return (input, options) => {
    validateOptions(options);
    const { text, map, label } = preprocessOrParseError(input);
    const positions = bytePositions(text);
    let captures: StageCapture;
    try {
      captures = binding.parsePreparedTree(text, { decimal: decimalMarkerFor(options?.locale) });
    } catch (error) {
      if (isStageParseError(error))
        throw new ParseError(
          error.message,
          input,
          "unicode",
          error.byteOffset === null ? 0 : map.toOriginal(positionAt(positions, error.byteOffset)),
        );
      throw error;
    }
    const tree = copyCaptures(captures, text, positions);
    return transformUnicodemathTree(
      label === undefined ? tree : postProcessing(tree, label),
      input,
    );
  };
}
