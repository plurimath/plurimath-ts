/** biome-ignore-all lint/style/useNamingConvention: property names are the versioned quantity JSON wire. */
import type { NumericWasmEvaluator } from "./wasm";

/** Plain strings retain the legacy exact-Rational request semantics. */
export type QuantityBindingValue =
  | string
  | { readonly decimal: string; readonly rational?: never; readonly binary64?: never }
  | {
      readonly rational: readonly [numerator: string, denominator: string];
      readonly decimal?: never;
      readonly binary64?: never;
    }
  | { readonly binary64: string; readonly decimal?: never; readonly rational?: never };

export interface QuantityBinding {
  readonly value: QuantityBindingValue;
  readonly unit?: string | null;
  readonly difference?: boolean;
  /** Additional kernel options are forwarded without filtering. */
  readonly [field: string]: unknown;
}

/** The kernel owns AST and registration validation, as for the raw JSON API. */
export interface QuantityRequest {
  readonly schema: "plurimath.evaluate.quantity/1";
  readonly ast: Readonly<Record<string, unknown>>;
  readonly bindings?: Readonly<Record<string, QuantityBinding>>;
  readonly convert_to?: string;
  readonly register?: readonly Readonly<Record<string, unknown>>[];
  readonly [field: string]: unknown;
}

/** Source numeric class and digits; do not coerce these values to JS numbers. */
export type QuantityNumericValue =
  | { readonly kind: "rational"; readonly numerator: string; readonly denominator: string }
  | { readonly kind: "decimal"; readonly value: string; readonly precision: number }
  | { readonly kind: "float"; readonly bits: string };

export interface QuantitySnapshot {
  readonly magnitude: string;
  readonly canonical_magnitude: string;
  readonly dimensions: Readonly<Record<string, string>>;
  readonly dimension_id: string | null;
  readonly scale: string;
  readonly terms: readonly {
    readonly unit: string;
    readonly prefix: string | null;
    readonly power: string;
  }[];
  /**
   * Present for explicit-tag requests on supporting kernels. Describes
   * magnitude, not canonical_magnitude; absent from legacy plain-string wires.
   */
  readonly numeric_value?: QuantityNumericValue;
  readonly [field: string]: unknown;
}

export interface QuantityResult {
  readonly value: QuantitySnapshot;
  readonly converted: QuantitySnapshot | null;
  readonly accuracy: { readonly symbol: string; readonly [field: string]: unknown };
  readonly [field: string]: unknown;
}

interface QuantityEnvelope {
  readonly schema: "plurimath.evaluate.quantity/1";
  readonly engine: "plurimath.quantity/1";
  readonly grammar: "plurimath.numeric-ast/1";
}

export type QuantityResponse =
  | (QuantityEnvelope & { readonly ok: true; readonly result: QuantityResult })
  | (QuantityEnvelope & {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly class?: string;
        readonly detail?: unknown;
        readonly [field: string]: unknown;
      };
    });

/**
 * Evaluate through an explicitly initialized kernel. Serializes the complete
 * request once, preserving numeric tags; returns the complete native response.
 * No binding normalization, numeric conversion, or fallback evaluator is used.
 */
export function evaluateQuantityRequest(
  kernel: NumericWasmEvaluator,
  request: QuantityRequest,
): QuantityResponse {
  const response: unknown = JSON.parse(kernel.evaluateRequest(JSON.stringify(request)));
  if (
    response === null ||
    typeof response !== "object" ||
    Array.isArray(response) ||
    !("schema" in response) ||
    response.schema !== "plurimath.evaluate.quantity/1" ||
    !("ok" in response) ||
    typeof response.ok !== "boolean"
  ) {
    throw new TypeError("The kernel returned an invalid quantity response envelope");
  }
  return response as QuantityResponse;
}
