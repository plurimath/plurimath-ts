/**
 * Maps offsets in a preprocessed string back to the original input.
 *
 * Preprocessing rewrites digraphs to single characters (AsciiMath: `{:` → `ℒ`,
 * `:)` → `ᑐ`), so a raw parser offset does not index what the caller passed in.
 * Every user-visible position — `ParseError.index`, diagnostics — is translated
 * through one of these first.
 */
export class SourceMap {
  /** originOf[i] is the offset in the original input of preprocessed char i. */
  private constructor(private readonly originOf: readonly number[]) {}

  /** Identity map, for formats that do not preprocess. */
  static identity(length: number): SourceMap {
    return new SourceMap(Array.from({ length }, (_, index) => index));
  }

  static fromSegments(segments: readonly PreprocessSegment[]): SourceMap {
    const originOf: number[] = [];
    for (const segment of segments) {
      for (let index = 0; index < segment.output.length; index++) {
        originOf.push(segment.originStart);
      }
    }
    return new SourceMap(originOf);
  }

  /** Translate a preprocessed offset to an offset in the original input. */
  toOriginal(offset: number): number {
    if (offset < this.originOf.length) return this.originOf[offset] as number;
    // Past the end (e.g. "unexpected end of input"): clamp to just after the
    // last mapped character so the position stays meaningful.
    const last = this.originOf[this.originOf.length - 1];
    return last === undefined ? 0 : last + 1;
  }
}

export interface PreprocessSegment {
  /** Offset of this segment's first character in the original input. */
  readonly originStart: number;
  /** What the segment became after preprocessing. */
  readonly output: string;
}
