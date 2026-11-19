/**
 * The amath stage call behind both AsciiMath entry points. Kept out of
 * `amath.ts` so the `./asciimath/amath` subpath exports only
 * `createAsciimathParser`.
 */
import { ParseError } from "../../core/index";
import { decimalMarkerFor } from "../../formatting/index";
import { DEPTH_LIMIT_MESSAGE } from "../../pegkit/atom";
import type { ParseValue } from "../../pegkit/index";
import {
  bytePositions,
  copyCaptures,
  isStageParseError,
  positionAt,
  type StageCapture,
} from "../../pegkit/stage-captures";
import { type AsciimathParseOptions, validateOptions } from "./consumer";
import { preprocess } from "./preprocess";

/** The stage's own depth guards (parsanol runtime error names). */
const STAGE_DEPTH_ERRORS: ReadonlySet<string> = new Set([
  "NestingTooDeep",
  "RecursionLimitExceeded",
  "CallDepthLimitExceeded",
  "ShapeDepthLimitExceeded",
]);

/**
 * Turns the stage's own depth refusal into the typed refusal the in-tree
 * grammar's MAX_DEPTH guard gives (no position), for the default
 * `parse(input, "asciimath")` path. The experimental `createAsciimathParser`
 * keeps the runtime's typed resource error, as the latex and unicodemath
 * stage parsers do.
 */
export function refuseStageDepth(error: unknown, input: string): never {
  if (error instanceof Error && STAGE_DEPTH_ERRORS.has(error.name)) {
    throw new ParseError(DEPTH_LIMIT_MESSAGE, input, "asciimath", 0);
  }
  throw error;
}

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
