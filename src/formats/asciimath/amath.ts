/** Initialized shared amath PARG/WASM consumer. No runtime loading or fallback. */
import { type FormulaNode, ParseError } from "../../core/index";
import { decimalMarkerFor } from "../../formatting/index";
import { type ParseHash, type ParseValue, Slice } from "../../pegkit/index";
import {
  type AsciimathParseOptions,
  ambiguousUncertaintyComma,
  transformAsciimathTree,
  validateOptions,
} from "./consumer";
import { preprocess } from "./preprocess";

export type { AsciimathParseOptions } from "./consumer";

/** RawTree wrapper removal and Renester belong to the shared stage. */
export type AmathCapture =
  | string
  | null
  | { readonly text: string; readonly offset: number }
  | readonly AmathCapture[]
  | { readonly [key: string]: AmathCapture };

export interface AmathSyncBinding {
  /** Offsets in capture leaves count UTF-8 bytes in the supplied stage input. */
  parseTree(input: string, options: { decimal: string }): AmathCapture;
}

/**
 * The caller initializes its Node/browser binding before creating this parser.
 * The returned parser preserves the synchronous Plurimath format contract.
 */
export function createAsciimathParser(
  binding: AmathSyncBinding,
): (input: string, options?: AsciimathParseOptions | null) => FormulaNode {
  return (input, options) => {
    validateOptions(options);
    const { text, map } = preprocess(input);
    ambiguousUncertaintyComma(input, text, options);
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
      // Artifact/initialization failures must never turn into syntax errors or
      // trigger a fallback to the retired handwritten grammar.
      throw error;
    }
    return transformAsciimathTree(copyCaptures(tree, text, positions), input);
  };
}

interface StageParseError extends Error {
  readonly byteOffset: number | null;
  readonly charOffset: number | null;
}

function isStageParseError(error: unknown): error is StageParseError {
  return (
    error instanceof Error &&
    "byteOffset" in error &&
    "charOffset" in error &&
    (error.byteOffset === null ||
      (typeof error.byteOffset === "number" && Number.isInteger(error.byteOffset)))
  );
}

/** UTF-8 boundaries -> JS UTF-16 positions, including the end boundary. */
function bytePositions(input: string): ReadonlyMap<number, number> {
  const positions = new Map<number, number>([[0, 0]]);
  let bytes = 0;
  let units = 0;
  for (const char of input) {
    const point = char.codePointAt(0) as number;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    units += char.length;
    positions.set(bytes, units);
  }
  return positions;
}

function positionAt(positions: ReadonlyMap<number, number>, byte: number): number {
  const position = positions.get(byte);
  if (position === undefined)
    throw new TypeError(`amath returned invalid UTF-8 byte offset ${byte}`);
  return position;
}

function sliceLeaf(
  value: AmathCapture,
): value is { readonly text: string; readonly offset: number } {
  return (
    value !== null &&
    !Array.isArray(value) &&
    typeof value === "object" &&
    "text" in value &&
    typeof value.text === "string" &&
    "offset" in value &&
    typeof value.offset === "number"
  );
}

/** Ruby SliceAdapter's ordered iterative walk; no deep-tree call-stack limit. */
function copyCaptures(
  root: AmathCapture,
  input: string,
  positions: ReadonlyMap<number, number>,
): ParseValue {
  let cursor = 0;
  const leaf = (value: AmathCapture): ParseValue | undefined => {
    if (value === null) return null;
    if (typeof value === "string") {
      const result = new Slice(value, cursor);
      cursor += value.length;
      return result;
    }
    if (!sliceLeaf(value)) return undefined;
    const start = positionAt(positions, value.offset);
    if (input.slice(start, start + value.text.length) !== value.text)
      throw new TypeError("amath capture does not match its input byte offset");
    cursor = Math.max(cursor, start + value.text.length);
    return new Slice(value.text, start);
  };
  const result = leaf(root);
  if (result !== undefined) return result;
  const output: ParseHash | ParseValue[] = Array.isArray(root) ? [] : {};
  const stack: {
    source: AmathCapture;
    output: ParseHash | ParseValue[];
    keys: string[];
    index: number;
  }[] = [{ source: root, output, keys: Object.keys(root as object), index: 0 }];
  while (stack.length) {
    const frame = stack[stack.length - 1] as (typeof stack)[number];
    const key = frame.keys[frame.index++];
    if (key === undefined) {
      stack.pop();
      continue;
    }
    const value = (frame.source as Record<string, AmathCapture>)[key] as AmathCapture;
    let converted = leaf(value);
    if (converted === undefined) {
      if (typeof value !== "object" || value === null)
        throw new TypeError("amath returned an invalid capture value");
      converted = Array.isArray(value) ? [] : {};
      stack.push({
        source: value,
        output: converted,
        keys: Object.keys(value as object),
        index: 0,
      });
    }
    if (Array.isArray(frame.output)) frame.output.push(converted);
    else
      Object.defineProperty(frame.output, key, {
        value: converted,
        enumerable: true,
        writable: true,
      });
  }
  return output;
}
