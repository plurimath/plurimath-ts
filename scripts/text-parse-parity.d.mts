/** biome-ignore-all lint/style/useNamingConvention: Plurimath is the public named export. */
import type { FacadeKernel } from "../src/facade/wasm";

export interface TextParseFixture {
  readonly source: string;
  readonly revision: string;
  readonly payloads: readonly { readonly path: string; readonly sha256: string }[];
  readonly rows: readonly {
    readonly id: string;
    readonly format: "asciimath" | "latex" | "unicode";
    readonly input: string;
    readonly expected: Readonly<Record<"asciimath" | "latex" | "unicodemath", string>>;
  }[];
  readonly refusals: readonly {
    readonly id: string;
    readonly format: "asciimath" | "latex" | "unicode";
    readonly input: string;
  }[];
}

interface TextFormula {
  toAsciimath(): string;
  toLatex(): string;
  toUnicodemath(): string;
}

export declare function replayTextParseParity(
  api: {
    readonly Plurimath: new (
      text: string,
      format: "asciimath" | "latex" | "unicode",
    ) => TextFormula;
  },
  kernel: FacadeKernel,
  fixture: TextParseFixture,
): { rows: number; comparisons: number; refusals: number; calls: number };
