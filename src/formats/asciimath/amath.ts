/** Initialized shared amath PARG/WASM consumer. No runtime loading or fallback. */
import { type FormulaNode, ParseError } from "../../core/index";
import { decimalMarkerFor } from "../../formatting/index";
import type { ParseValue } from "../../pegkit/index";
import {
  bytePositions,
  copyCaptures,
  isStageParseError,
  positionAt,
  type StageCapture,
} from "../../pegkit/stage-captures";
import { type AsciimathParseOptions, transformAsciimathTree, validateOptions } from "./consumer";
import { preprocess } from "./preprocess";

export type { AsciimathParseOptions } from "./consumer";

/** RawTree wrapper removal and Renester belong to the shared stage. */
export type AmathCapture = StageCapture;

export interface AmathSyncBinding {
  /** Offsets in capture leaves count UTF-8 bytes in the supplied stage input. */
  parseTree(input: string, options: { decimal: string }): AmathCapture;
}

/**
 * The stage's capture tree as a Parslet-shaped value whose slices index the
 * preprocessed text. `ParseError.index` indexes the caller's input.
 */
export function parseStageTree(
  binding: AmathSyncBinding,
  input: string,
  options?: AsciimathParseOptions | null,
): ParseValue {
  validateOptions(options);
  const { text, map } = preprocess(input);
  const positions = bytePositions(text);
  let tree: AmathCapture;
  try {
    tree = binding.parseTree(text, { decimal: decimalMarkerFor(options?.locale) });
  } catch (error) {
    if (isStageParseError(error)) {
      const index =
        error.byteOffset === null ? 0 : map.toOriginal(positionAt(positions, error.byteOffset));
      throw new ParseError(error.message, input, "asciimath", index);
    }
    // Artifact/initialization failures must never turn into syntax errors.
    throw error;
  }
  return copyCaptures(tree, text, positions);
}

/**
 * The caller initializes its Node/browser binding before creating this parser.
 * The returned parser preserves the synchronous Plurimath format contract.
 */
export function createAsciimathParser(
  binding: AmathSyncBinding,
): (input: string, options?: AsciimathParseOptions | null) => FormulaNode {
  return (input, options) => transformAsciimathTree(parseStageTree(binding, input, options), input);
}
