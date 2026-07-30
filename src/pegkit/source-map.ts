/**
 * Maps offsets in a preprocessed string back to the original input.
 *
 * Preprocessing rewrites digraphs to single characters (AsciiMath: `{:` → `ℒ`,
 * `:)` → `ᑐ`), so a raw parser offset does not index what the caller passed in.
 * Every user-visible position — `ParseError.index`, diagnostics — is translated
 * through one of these first.
 */
export class SourceMap {
  private constructor(
    /** originOf[i] is the offset in the original input of preprocessed char i. */
    private readonly originOf: readonly number[],
    /** Length of the original input, so past-the-end offsets clamp correctly. */
    private readonly originalLength: number,
  ) {}

  /** Identity map, for formats that do not preprocess. */
  static identity(length: number): SourceMap {
    return new SourceMap(
      Array.from({ length }, (_, index) => index),
      length,
    );
  }

  static fromSegments(segments: readonly PreprocessSegment[]): SourceMap {
    const originOf: number[] = [];
    let originalLength = 0;
    for (const segment of segments) {
      for (let index = 0; index < segment.output.length; index++) {
        originOf.push(segment.originStart);
      }
      originalLength = segment.originStart + segment.originLength;
    }
    return new SourceMap(originOf, originalLength);
  }

  /** Translate a preprocessed offset to an offset in the original input. */
  toOriginal(offset: number): number {
    if (offset < this.originOf.length) return this.originOf[offset] as number;
    // Past the end — e.g. "unexpected end of input". Clamp to the end of the
    // original input. Deriving this from the last segment's start would land
    // mid-token whenever the input ends in a rewritten digraph: `"{:"` → `"ℒ"`
    // would report 1 rather than 2.
    return this.originalLength;
  }
}

export interface PreprocessSegment {
  /** Offset of this segment's first character in the original input. */
  readonly originStart: number;
  /** How many characters of the original input this segment consumed. */
  readonly originLength: number;
  /** What the segment became after preprocessing. */
  readonly output: string;
}
