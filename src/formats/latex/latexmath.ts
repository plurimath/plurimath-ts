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
  type LatexParseOptions,
  preprocessOrParseError,
  transformLatexTree,
  validateOptions,
} from "./consumer";

export type { LatexParseOptions } from "./consumer";
export interface LatexStageBinding {
  parsePreparedTree(input: string, options: { decimal: string }): StageCapture;
}
export function createLatexParser(
  binding: LatexStageBinding,
): (input: string, options?: LatexParseOptions | null) => FormulaNode {
  return (input, options) => {
    validateOptions(options);
    const { text, map } = preprocessOrParseError(input);
    const positions = bytePositions(text);
    let captures: StageCapture;
    try {
      captures = binding.parsePreparedTree(text, { decimal: decimalMarkerFor(options?.locale) });
    } catch (error) {
      if (isStageParseError(error))
        throw new ParseError(
          error.message,
          input,
          "latex",
          error.byteOffset === null ? 0 : map.toOriginal(positionAt(positions, error.byteOffset)),
        );
      throw error;
    }
    return transformLatexTree(copyCaptures(captures, text, positions), input);
  };
}
