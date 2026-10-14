import type { NormalizedNode } from "../core/index";
import generated from "./generated/data.json";
import type { UnitsmlGrammarTokens } from "./grammar";

export interface ReferenceError {
  readonly class: string;
  readonly message: string;
}
export interface TokenRecord {
  readonly input: string;
  readonly mathml?: string;
  readonly ascii?: string;
  readonly xml?: string;
  readonly model?: NormalizedNode;
  readonly raises?: string;
  readonly message?: string;
  readonly mathmlError?: ReferenceError;
  readonly asciiError?: ReferenceError;
  readonly xmlError?: ReferenceError;
  readonly modelError?: ReferenceError;
}
export interface UnitsmlData {
  /** Pinned Ruby census aliases mapped to their native carrier kind. */
  readonly modelKinds?: Readonly<Record<string, string>>;
  readonly tokens: UnitsmlGrammarTokens;
  readonly units: Readonly<Record<string, TokenRecord>>;
  readonly prefixes: Readonly<Record<string, TokenRecord>>;
  readonly dimensions: Readonly<Record<string, TokenRecord>>;
  readonly prefixedUnits: Readonly<Record<string, TokenRecord>>;
  readonly resolvedTokens?: Readonly<Record<string, NormalizedNode>>;
  readonly special?: Readonly<Record<string, TokenRecord>>;
  readonly database: Readonly<Record<string, unknown>>;
  readonly dimensionVectors?: readonly { readonly id: string; readonly vector: string }[];
  readonly utility?: {
    readonly u2d: Readonly<Record<string, DimensionRule>>;
    readonly dim2d: Readonly<Record<string, DimensionRule>>;
    readonly dimsVector: readonly string[];
  };
}

export interface DimensionRule {
  readonly dimension: string;
  readonly order: number;
  readonly symbol: string;
}

export const UNITSML_DATA = generated as unknown as UnitsmlData;
