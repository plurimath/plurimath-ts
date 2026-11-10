import type { ParseHash, ParseValue } from "./atom";
import { Slice } from "./slice";
export type StageCapture =
  | string
  | null
  | { readonly text: string; readonly offset: number }
  | readonly StageCapture[]
  | { readonly [key: string]: StageCapture };

export interface StageParseError extends Error {
  readonly byteOffset: number | null;
  readonly charOffset: number | null;
}

export function isStageParseError(error: unknown): error is StageParseError {
  return (
    error instanceof Error &&
    "byteOffset" in error &&
    "charOffset" in error &&
    (error.byteOffset === null ||
      (typeof error.byteOffset === "number" && Number.isInteger(error.byteOffset)))
  );
}

/** UTF-8 boundaries -> JS UTF-16 positions, including the end boundary. */
export function bytePositions(input: string): ReadonlyMap<number, number> {
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

export function positionAt(positions: ReadonlyMap<number, number>, byte: number): number {
  const position = positions.get(byte);
  if (position === undefined)
    throw new TypeError(`stage returned invalid UTF-8 byte offset ${byte}`);
  return position;
}

function sliceLeaf(
  value: StageCapture,
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
export function copyCaptures(
  root: StageCapture,
  input: string,
  positions: ReadonlyMap<number, number>,
): ParseValue {
  let cursor = 0;
  const leaf = (value: StageCapture): ParseValue | undefined => {
    if (value === null) return null;
    if (typeof value === "string") {
      const result = new Slice(value, cursor);
      cursor += value.length;
      return result;
    }
    if (!sliceLeaf(value)) return undefined;
    const start = positionAt(positions, value.offset);
    if (input.slice(start, start + value.text.length) !== value.text)
      throw new TypeError("stage capture does not match its input byte offset");
    cursor = Math.max(cursor, start + value.text.length);
    return new Slice(value.text, start);
  };
  const result = leaf(root);
  if (result !== undefined) return result;
  const output: ParseHash | ParseValue[] = Array.isArray(root) ? [] : {};
  const stack: {
    source: StageCapture;
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
    const value = (frame.source as Record<string, StageCapture>)[key] as StageCapture;
    let converted = leaf(value);
    if (converted === undefined) {
      if (typeof value !== "object" || value === null)
        throw new TypeError("stage returned an invalid capture value");
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
