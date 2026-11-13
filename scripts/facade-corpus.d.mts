/** biome-ignore-all lint/style/useNamingConvention: fixture keys are snake_case. */
/** Types for scripts/facade-corpus.mjs. */
export interface FacadeCorpusCase {
  readonly id: string;
  readonly kind: "writer" | "parser";
  readonly format: string;
  readonly construct?: { readonly op: string; readonly [key: string]: unknown };
  readonly request?: { readonly op: "parse"; readonly [key: string]: unknown };
  readonly options?: { readonly [key: string]: unknown };
  readonly expected: {
    readonly output?: string;
    readonly model?: unknown;
    readonly source_class?: string;
  };
}
export interface FacadeTextRow {
  readonly input: { readonly format: string; readonly text: string };
  readonly outcome: "model" | "unbuilt" | "error";
  readonly [key: string]: unknown;
}
export interface FacadeCorpus {
  readonly counts: { readonly writer: number; readonly parser: number };
  readonly correction: string;
  readonly cases: readonly FacadeCorpusCase[];
  readonly text87: readonly FacadeTextRow[];
  readonly sourceValues: readonly {
    readonly id: string;
    readonly document: unknown;
    readonly writers: object;
  }[];
}
export declare const FACADE_COUNTS: {
  readonly writer: 3798;
  readonly parser: 1349;
  readonly originalWriter: 2928;
  readonly textWriter: 870;
  readonly parserRefusals: 23;
  readonly text87: { readonly model: 67; readonly unbuilt: 11; readonly error: 9 };
  readonly sourceValues: 18;
};
export declare function loadFacadeCorpus(root: string): FacadeCorpus;
export declare function replayFacade(
  api: unknown,
  kernel: unknown,
  data: FacadeCorpus,
  options?: { readonly limit?: number; readonly progress?: (done: number) => void },
): Promise<Record<string, unknown>>;
