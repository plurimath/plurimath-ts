/**
 * A matched span of input, mirroring `Parslet::Slice`.
 *
 * `offset` indexes the string the parser was given. When a format preprocesses
 * its input (AsciiMath rewrites `{:` to `ℒ`, which changes lengths), offsets
 * must be mapped back to the caller's original input before they reach a
 * `ParseError` or a diagnostic — see `SourceMap`.
 */
export class Slice {
  constructor(
    readonly text: string,
    readonly offset: number,
  ) {}

  toString(): string {
    return this.text;
  }
}
